import 'dart:convert';
import 'dart:io';

import 'package:shelf/shelf.dart' as shelf;
import 'package:shelf/shelf_io.dart' as shelf_io;
import 'package:shelf_router/shelf_router.dart';

import 'package:simple_live_app/app/constant.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/core/simple_live_core.dart';

/// app 内嵌 HTTP 直播服务
///
/// 用 shelf 实现，API 契约与 Node.js 服务端（`simple_live_server_nodejs`）
/// 完全一致，复用 `RemoteLiveApi` 已有的 `/api/v1/sites/...` 格式。
///
/// 绑定 `serverUrl` 中的本机 IP（127.0.0.1 或本机网卡 IPv4）+ 指定端口，
/// 供本机 App 及同局域网其他设备访问。**不绑定 0.0.0.0**，避免暴露到
/// 公网/不受信任网络。
/// 同步/Cookie 接口在本机模式下实现为 no-op（本机无需同步，Cookie 已在本地）。

/// 内嵌服务绑定失败异常（端口占用、地址不在本机网卡等）。
class EmbeddedServerBindException implements Exception {
  final String message;
  EmbeddedServerBindException(this.message);
  @override
  String toString() => 'EmbeddedServerBindException: $message';
}
class EmbeddedLiveServer {
  EmbeddedLiveServer._();
  static final EmbeddedLiveServer instance = EmbeddedLiveServer._();

  HttpServer? _server;
  String? baseUrl;
  String? _currentHost;
  int? _currentPort;

  /// 当前服务是否正在运行
  bool get isRunning => _server != null && baseUrl != null;

  /// 启动内嵌服务，绑定到 [host]（字符串形式的 IPv4）+ [port]。
  ///
  /// [host] 必须是 127.0.0.1、本机 LAN IP，或 LocalIpUtil.getLocalIpList()
  /// 中的某个地址。调用方负责把 URL 里的 host 解析好（含 0.0.0.0 特殊处理）。
  /// [port] 必须 > 0；调用方负责把 URL 里的端口或默认端口解析好。
  ///
  /// 已运行且 (host, port) 与当前一致则直接返回 baseUrl（幂等）；
  /// 已运行但 (host, port) 不同则先 stop 再按新参数 start。
  ///
  /// 绑定失败（端口占用、地址不在本机网卡等）抛 [EmbeddedServerBindException]。
  Future<String> start({required String host, required int port}) async {
    if (isRunning && _currentHost == host && _currentPort == port) {
      return baseUrl!;
    }
    if (isRunning) {
      await stop();
    }

    final router = _buildRouter();
    final handler = const shelf.Pipeline()
        .addMiddleware(shelf.logRequests(logger: (msg, isError) {
          if (isError) {
            Log.logPrint('[EmbeddedLiveServer] $msg');
          } else {
            Log.d('[EmbeddedLiveServer] $msg');
          }
        }))
        .addHandler(router.call);

    InternetAddress bindAddr;
    try {
      // loopback / localhost 直接用常量，避免 DNS 查询开销与失败
      if (host == '127.0.0.1' || host == 'localhost') {
        bindAddr = InternetAddress.loopbackIPv4;
      } else {
        final addrs = await InternetAddress.lookup(host,
            type: InternetAddressType.IPv4);
        if (addrs.isEmpty) {
          throw EmbeddedServerBindException('无法解析地址: $host');
        }
        bindAddr = addrs.firstWhere(
          (a) => a.type == InternetAddressType.IPv4,
          orElse: () => addrs.first,
        );
      }
    } on EmbeddedServerBindException {
      rethrow;
    } on SocketException catch (e) {
      throw EmbeddedServerBindException('地址解析失败: $host (${e.message})');
    } on ArgumentError catch (e) {
      throw EmbeddedServerBindException('无效地址: $host (${e.message})');
    }

    HttpServer server;
    try {
      server = await shelf_io.serve(handler, bindAddr, port);
    } on SocketException catch (e) {
      throw EmbeddedServerBindException(
          '绑定 $host:$port 失败（端口可能被占用或地址不在本机网卡）: ${e.message}');
    }

    server.autoCompress = true;
    _server = server;
    _currentHost = host;
    _currentPort = port;
    baseUrl = 'http://$host:$port';
    Log.d('EmbeddedLiveServer serving at $baseUrl');
    return baseUrl!;
  }

  /// 停止内嵌服务（幂等）。
  Future<void> stop() async {
    final server = _server;
    _server = null;
    baseUrl = null;
    _currentHost = null;
    _currentPort = null;
    if (server != null) {
      await server.close(force: true);
      Log.d('EmbeddedLiveServer stopped');
    }
  }

  // ============ 路由构建 ============

  Router _buildRouter() {
    final router = Router();

    // 健康检查（plain text，与 Node.js 一致）
    router.get('/health', _healthHandler);

    // 根路径：返回简单 OK，避免外部探测（如 /?key=xxx）刷 404 日志
    router.get('/', _rootHandler);

    // 平台列表
    router.get('/api/v1/sites', _sitesHandler);

    // 分类列表
    router.get('/api/v1/sites/<siteId>/categories', _categoriesHandler);

    // 推荐房间
    router.get('/api/v1/sites/<siteId>/recommend', _recommendHandler);

    // 分类下房间
    router.get('/api/v1/sites/<siteId>/categories/rooms', _categoryRoomsHandler);

    // 搜索直播间
    router.get('/api/v1/sites/<siteId>/search/rooms', _searchRoomsHandler);

    // 搜索主播
    router.get('/api/v1/sites/<siteId>/search/anchors', _searchAnchorsHandler);

    // 房间详情
    router.get('/api/v1/sites/<siteId>/rooms/<roomId>', _roomDetailHandler);

    // 直播状态
    router.get('/api/v1/sites/<siteId>/rooms/<roomId>/live-status',
        _liveStatusHandler);

    // 清晰度列表
    router.get('/api/v1/sites/<siteId>/rooms/<roomId>/qualities',
        _qualitiesHandler);

    // 播放直链
    router.post('/api/v1/sites/<siteId>/rooms/<roomId>/play-urls',
        _playUrlsHandler);

    // SC 消息
    router.get('/api/v1/sites/<siteId>/rooms/<roomId>/super-chat',
        _superChatHandler);

    // 同步接口（本机模式 no-op）
    _registerSyncNoOp(router);

    // Cookie 接口（本机模式 no-op）
    _registerCookieNoOp(router);

    return router;
  }

  // ============ 路由处理器 ============

  shelf.Response _healthHandler(shelf.Request request) {
    return shelf.Response.ok('ok', headers: {
      'Content-Type': 'text/plain',
    });
  }

  /// 根路径处理器：返回简单 OK，消除外部探测请求（如 /?key=xxx）的 404 日志噪音
  shelf.Response _rootHandler(shelf.Request request) {
    return shelf.Response.ok('ok', headers: {
      'Content-Type': 'text/plain',
    });
  }

  Future<shelf.Response> _sitesHandler(shelf.Request request) async {
    try {
      final sites = Sites.allSites.values
          .where((s) => s.id != Constant.kLocal) // 本地服务不暴露"本地"虚拟平台
          .map((s) => {'id': s.id, 'name': s.name})
          .toList();
      return _ok(sites);
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _categoriesHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final list = await _getSite(siteId).getCategores();
      return _ok(list.map(_categoryToJson).toList());
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _recommendHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final page = _getPage(request);
      final result = await _getSite(siteId).getRecommendRooms(page: page);
      return _ok(_categoryResultToJson(result));
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _categoryRoomsHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final page = _getPage(request);
      final query = request.requestedUri.queryParameters;
      final categoryId = query['categoryId'];
      if (categoryId == null || categoryId.isEmpty) {
        return _badRequest('缺少 categoryId 参数');
      }
      final parentId = query['parentId'] ?? '';
      final name = query['name'] ?? '';
      final category = LiveSubCategory(
        id: categoryId,
        name: name,
        parentId: parentId,
      );
      final result =
          await _getSite(siteId).getCategoryRooms(category, page: page);
      return _ok(_categoryResultToJson(result));
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _searchRoomsHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final page = _getPage(request);
      final keyword = request.requestedUri.queryParameters['keyword'] ?? '';
      if (keyword.isEmpty) {
        return _badRequest('缺少 keyword 参数');
      }
      final result = await _getSite(siteId).searchRooms(keyword, page: page);
      return _ok(_searchRoomResultToJson(result));
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _searchAnchorsHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final page = _getPage(request);
      final keyword = request.requestedUri.queryParameters['keyword'] ?? '';
      if (keyword.isEmpty) {
        return _badRequest('缺少 keyword 参数');
      }
      final result = await _getSite(siteId).searchAnchors(keyword, page: page);
      return _ok(_searchAnchorResultToJson(result));
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _roomDetailHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final roomId = request.params['roomId']!;
      final detail = await _getSite(siteId).getRoomDetail(roomId: roomId);
      return _ok(_roomDetailToJson(detail));
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _liveStatusHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final roomId = request.params['roomId']!;
      final status = await _getSite(siteId).getLiveStatus(roomId: roomId);
      return _ok({'liveStatus': status});
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _qualitiesHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final roomId = request.params['roomId']!;
      // 获取清晰度需先拿到房间详情
      final detail = await _getSite(siteId).getRoomDetail(roomId: roomId);
      final qualities = await _getSite(siteId).getPlayQualites(detail: detail);
      return _ok(qualities.map((q) => _playQualityToJson(q, siteId)).toList());
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _playUrlsHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final body = await request.readAsString();
      if (body.isEmpty) {
        return _badRequest('请求体不能为空，需包含 detail 和 quality');
      }
      final jsonBody = json.decode(body) as Map<String, dynamic>;
      final detailJson = jsonBody['detail'] as Map<String, dynamic>?;
      final qualityJson = jsonBody['quality'] as Map<String, dynamic>?;
      if (detailJson == null || qualityJson == null) {
        return _badRequest('请求体需包含 detail 和 quality 字段');
      }
      final detail = _roomDetailFromJson(detailJson);
      final quality = _playQualityFromJson(qualityJson, siteId);
      final playUrl =
          await _getSite(siteId).getPlayUrls(detail: detail, quality: quality);
      return _ok(_playUrlToJson(playUrl));
    } catch (e) {
      return _error(e);
    }
  }

  Future<shelf.Response> _superChatHandler(shelf.Request request) async {
    try {
      final siteId = request.params['siteId']!;
      final roomId = request.params['roomId']!;
      final list =
          await _getSite(siteId).getSuperChatMessage(roomId: roomId);
      return _ok(list.map(_superChatToJson).toList());
    } catch (e) {
      return _error(e);
    }
  }

  // ============ 同步/Cookie no-op ============

  void _registerSyncNoOp(Router router) {
    // GET 拉取接口返回空数组/空对象；POST 同步接口原样回传空结果
    router.get('/api/v1/sync/follow', (_) => _ok(<dynamic>[]));
    router.post('/api/v1/sync/follow', (_) => _ok(<dynamic>[]));
    router.delete('/api/v1/sync/follow/<id>', (_) => _ok(<dynamic>[]));
    router.get('/api/v1/sync/tag', (_) => _ok(<dynamic>[]));
    router.post('/api/v1/sync/tag', (_) => _ok(<dynamic>[]));
    router.get('/api/v1/sync/history', (_) => _ok(<dynamic>[]));
    router.post('/api/v1/sync/history', (_) => _ok(<dynamic>[]));
    router.delete('/api/v1/sync/history/<id>', (_) => _ok(<dynamic>[]));
    router.get('/api/v1/sync/blocked_word', (_) => _ok(<dynamic>[]));
    router.post('/api/v1/sync/blocked_word', (_) => _ok(<dynamic>[]));
    router.get('/api/v1/sync/settings', (_) => _ok(<String, dynamic>{}));
    router.post('/api/v1/sync/settings', (_) => _ok(<String, dynamic>{}));
  }

  void _registerCookieNoOp(Router router) {
    router.get('/api/v1/cookie/<siteId>',
        (req) => _ok({'cookie': ''}));
    router.put('/api/v1/cookie/<siteId>', (req) async {
      final siteId = req.params['siteId']!;
      return _ok({'siteId': siteId, 'cookie': ''});
    });
    router.delete('/api/v1/cookie/<siteId>',
        (req) => _ok({'siteId': req.params['siteId'], 'deleted': true}));
  }

  // ============ 辅助方法 ============

  LiveSite _getSite(String siteId) {
    final site = Sites.allSites[siteId];
    if (site == null || site.liveSite == null) {
      throw ArgumentError('不支持的平台: $siteId');
    }
    return site.liveSite!;
  }

  int _getPage(shelf.Request request) {
    final raw = request.requestedUri.queryParameters['page'];
    if (raw == null) return 1;
    final parsed = int.tryParse(raw);
    return parsed ?? 1;
  }

  /// 成功响应：`{code:0, data:..., msg:''}`（与 Node.js ApiResponse 一致）
  shelf.Response _ok(dynamic data) {
    return shelf.Response.ok(
      json.encode({'code': 0, 'data': data, 'msg': ''}),
      headers: {'Content-Type': 'application/json'},
    );
  }

  shelf.Response _badRequest(String msg) {
    return shelf.Response(
      400,
      body: json.encode({'code': 400, 'data': null, 'msg': msg}),
      headers: {'Content-Type': 'application/json'},
    );
  }

  shelf.Response _error(Object e) {
    final msg = e is Error ? e.toString() : e.toString();
    final isArgError = e is ArgumentError;
    return shelf.Response(
      isArgError ? 404 : 500,
      body: json.encode({
        'code': isArgError ? 404 : 500,
        'data': null,
        'msg': msg,
      }),
      headers: {'Content-Type': 'application/json'},
    );
  }

  // ============ JSON 序列化（与 Node.js LiveSiteService.*ToJson 字段一致） ============

  Map<String, dynamic> _categoryToJson(LiveCategory c) {
    return {
      'id': c.id,
      'name': c.name,
      'children': c.children.map(_subCategoryToJson).toList(),
    };
  }

  Map<String, dynamic> _subCategoryToJson(LiveSubCategory sub) {
    return {
      'id': sub.id,
      'name': sub.name,
      'parentId': sub.parentId,
      'pic': sub.pic ?? '',
    };
  }

  Map<String, dynamic> _categoryResultToJson(LiveCategoryResult result) {
    return {
      'hasMore': result.hasMore,
      'items': result.items.map(_roomItemToJson).toList(),
    };
  }

  Map<String, dynamic> _searchRoomResultToJson(LiveSearchRoomResult result) {
    return {
      'hasMore': result.hasMore,
      'items': result.items.map(_roomItemToJson).toList(),
    };
  }

  Map<String, dynamic> _searchAnchorResultToJson(LiveSearchAnchorResult result) {
    return {
      'hasMore': result.hasMore,
      'items': result.items.map(_anchorItemToJson).toList(),
    };
  }

  Map<String, dynamic> _roomItemToJson(LiveRoomItem item) {
    return {
      'roomId': item.roomId,
      'title': item.title,
      'cover': item.cover,
      'userName': item.userName,
      'online': item.online,
    };
  }

  Map<String, dynamic> _anchorItemToJson(LiveAnchorItem item) {
    return {
      'roomId': item.roomId,
      'userName': item.userName,
      'avatar': item.avatar,
      'liveStatus': item.liveStatus,
    };
  }

  Map<String, dynamic> _roomDetailToJson(LiveRoomDetail detail) {
    return {
      'roomId': detail.roomId,
      'title': detail.title,
      'cover': detail.cover,
      'userName': detail.userName,
      'userAvatar': detail.userAvatar,
      'online': detail.online,
      'introduction': detail.introduction ?? '',
      'notice': detail.notice ?? '',
      'status': detail.status,
      'data': _encodeDynamic(detail.data),
      'danmakuData': _encodeDynamic(detail.danmakuData),
      'url': detail.url,
      'isRecord': detail.isRecord,
      'showTime': detail.showTime ?? '',
    };
  }

  LiveRoomDetail _roomDetailFromJson(Map<String, dynamic> json) {
    return LiveRoomDetail(
      roomId: json['roomId'] as String,
      title: json['title'] as String,
      cover: json['cover'] as String,
      userName: json['userName'] as String,
      userAvatar: json['userAvatar'] as String,
      online: (json['online'] as num?)?.toInt() ?? 0,
      introduction: (json['introduction'] as String?) ?? '',
      notice: (json['notice'] as String?) ?? '',
      status: json['status'] as bool,
      url: json['url'] as String,
      data: _decodeDynamic(json['data']),
      danmakuData: _decodeDynamic(json['danmakuData']),
      isRecord: json['isRecord'] as bool? ?? false,
      showTime: json['showTime'] as String?,
    );
  }

  Map<String, dynamic> _playQualityToJson(LivePlayQuality q, String siteId) {
    return {
      'quality': q.quality,
      'data': _encodeQualityData(q.data, siteId),
      'sort': q.sort,
    };
  }

  LivePlayQuality _playQualityFromJson(Map<String, dynamic> json, String siteId) {
    return LivePlayQuality(
      quality: json['quality'] as String,
      data: _decodeQualityData(json['data'], siteId),
      sort: (json['sort'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> _playUrlToJson(LivePlayUrl url) {
    return {
      'urls': url.urls,
      'headers': url.headers ?? <String, String>{},
    };
  }

  Map<String, dynamic> _superChatToJson(LiveSuperChatMessage sc) {
    return {
      'userName': sc.userName,
      'face': sc.face,
      'message': sc.message,
      'price': sc.price,
      'startTime': sc.startTime.toUtc().toIso8601String(),
      'endTime': sc.endTime.toUtc().toIso8601String(),
      'backgroundColor': sc.backgroundColor,
      'backgroundBottomColor': sc.backgroundBottomColor,
    };
  }

  // ============ 动态类型编解码（与 RemoteLiveApi 客户端解码对称） ============

  dynamic _encodeDynamic(dynamic value) {
    if (value == null) return null;
    if (value is String || value is num || value is bool) return value;
    if (value is List || value is Map) return value;
    return value.toString();
  }

  dynamic _decodeDynamic(dynamic value) {
    if (value == null) return null;
    return value;
  }

  /// 序列化 quality.data（按 siteId）
  dynamic _encodeQualityData(dynamic value, String siteId) {
    if (value == null) return null;
    if (value is String || value is num || value is bool) return value;
    if (value is List || value is Map) return value;
    // 斗鱼 DouyuPlayData
    if (siteId == 'douyu' && value is DouyuPlayData) {
      return {'rate': value.rate, 'cdns': value.cdns};
    }
    return value.toString();
  }

  /// 反序列化 quality.data（按 siteId，与 RemoteLiveApi._decodeQualityData 对称）
  dynamic _decodeQualityData(dynamic value, String siteId) {
    if (value == null) return null;
    // 斗鱼：还原为 DouyuPlayData
    if (siteId == 'douyu' && value is Map) {
      final rate = (value['rate'] as num?)?.toInt() ?? 0;
      final cdns = (value['cdns'] as List?)?.cast<String>() ?? <String>[];
      return DouyuPlayData(rate, cdns);
    }
    // B站 data 为 int
    if (siteId == 'bilibili' && value is num) {
      return value.toInt();
    }
    // 其余平台直接透传
    return value;
  }
}
