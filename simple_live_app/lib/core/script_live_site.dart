import 'package:simple_live_app/core/common/core_error.dart';
import 'package:simple_live_app/core/common/core_log.dart';
import 'package:simple_live_app/core/common/http_client.dart';
import 'package:simple_live_app/app/services/danmaku_data_codec.dart';
import 'package:simple_live_app/core/danmaku/bilibili_danmaku.dart';
import 'package:simple_live_app/core/danmaku/douyin_danmaku.dart';
import 'package:simple_live_app/core/danmaku/douyu_danmaku.dart';
import 'package:simple_live_app/core/danmaku/huya_danmaku.dart';
import 'package:simple_live_app/core/interface/live_danmaku.dart';
import 'package:simple_live_app/core/interface/live_site.dart';
import 'package:simple_live_app/core/model/live_anchor_item.dart';
import 'package:simple_live_app/core/model/live_category.dart';
import 'package:simple_live_app/core/model/live_category_result.dart';
import 'package:simple_live_app/core/model/live_message.dart';
import 'package:simple_live_app/core/model/live_play_quality.dart';
import 'package:simple_live_app/core/model/live_play_url.dart';
import 'package:simple_live_app/core/model/live_room_detail.dart';
import 'package:simple_live_app/core/model/live_room_item.dart';
import 'package:simple_live_app/core/model/live_search_result.dart';
import 'package:simple_live_app/core/scripts/js_runtime.dart';

/// 基于 JS 脚本的通用直播站点实现
///
/// 通过下载的 JS 文件提供站点能力。JS 与 Dart 的接口契约如下：
///
/// ## JS 全局函数约定（函数名固定）
///
/// | 函数 | 参数 | 返回 |
/// |------|------|------|
/// | `getSiteInfo()` | 无 | `{id, name, logo?}` |
/// | `getCategores()` | 无 | `LiveCategory[]` 或 请求描述符 |
/// | `getRecommendRooms(page)` | `number` | `LiveCategoryResult` 或 请求描述符 |
/// | `getCategoryRooms(category, page)` | `LiveSubCategory, number` | 同上 |
/// | `searchRooms(keyword, page)` | `string, number` | `LiveSearchRoomResult` 或 请求描述符 |
/// | `searchAnchors(keyword, page)` | `string, number` | `LiveSearchAnchorResult` 或 请求描述符 |
/// | `getRoomDetail(roomId)` | `string` | `LiveRoomDetail` 或 请求描述符 |
/// | `getLiveStatus(roomId)` | `string` | `boolean` 或 请求描述符 |
/// | `getPlayQualites(detail)` | `LiveRoomDetail` | `LivePlayQuality[]` 或 请求描述符 |
/// | `getPlayUrls(detail, quality)` | `LiveRoomDetail, LivePlayQuality` | `LivePlayUrl` 或 请求描述符 |
/// | `getSuperChatMessage(roomId)` | `string` | `LiveSuperChatMessage[]` 或 请求描述符 |
///
/// ## 请求描述符（解决 JS 无法直接联网的问题）
///
/// dart_quickjs 不支持将 Dart 回调注册为 JS 可调用对象，因此 JS 内部
/// 不能直接调用 `fetch`。当某个函数需要联网时，返回一个请求描述符：
/// ```json
/// {
///   "url": "https://...",
///   "method": "GET",
///   "headers": {"key": "value"},
///   "data": "请求体",
///   "parse": "parseFnName"
/// }
/// ```
/// Dart 侧执行该请求后，将响应体（字符串）作为第一个参数、原调用参数
/// 作为后续参数，调用名为 `parse` 的全局函数，其返回值同样可以是最终
/// 结果或另一个请求描述符（支持链式请求）。
///
/// `getRoomDetail` 返回的 `danmakuData` 必须是 **Map**（按 siteId 匹配下表的
/// key 集，类型必须严格匹配）。Dart 侧会在服务端 / 客户端边界把它还原为对应
/// 平台弹幕组件所需的 Args 对象：
///
/// | siteId    | key 列表                                                                 |
/// |-----------|--------------------------------------------------------------------------|
/// | bilibili  | `roomId`(int) `token`(str) `buvid`(str) `serverHost`(str) `uid`(int) `cookie`(str) |
/// | douyin    | `webRid`(str) `roomId`(str) `userId`(str) `cookie`(str)                  |
/// | huya      | `ayyuid`(int) `topSid`(int) `subSid`(int)                                |
/// | douyu     | 透传 String roomId，不需要 `danmakuData` 字段                            |
///
/// ## 弹幕
///
/// 弹幕不通过 JS 实现。根据站点 id 匹配内置原生弹幕处理器
/// (bilibili/douyu/huya/douyin)，无匹配则返回空实现。
class ScriptLiveSite implements LiveSite {
  final JsEngine _js;
  final String _jsSource;

  /// 站点 logo（由 JS 的 getSiteInfo 返回，可空）
  String _logo = '';

  ScriptLiveSite({required String jsSource, JsEngine? js})
      : _jsSource = jsSource,
        _js = js ?? JsEngine() {
    _init();
  }

  void _init() {
    _js.eval(_jsSource);
    _loadSiteInfo();
  }

  void _loadSiteInfo() {
    if (!_js.hasFunction('getSiteInfo')) return;
    try {
      final info = _js.callGlobalJson('getSiteInfo', []);
      if (info is Map) {
        id = info['id']?.toString() ?? '';
        name = info['name']?.toString() ?? '';
        _logo = info['logo']?.toString() ?? '';
      }
    } catch (e, s) {
      CoreLog.e('ScriptLiveSite 加载站点信息失败: $e', s);
    }
  }

  /// 仅用于外部强制设置元信息（如安装时预填）
  void setMeta({String? id, String? name, String? logo}) {
    if (id != null) this.id = id;
    if (name != null) this.name = name;
    if (logo != null) _logo = logo;
  }

  @override
  String id = '';

  @override
  String name = '';

  /// 站点 logo（由 JS 上报，用于列表展示）
  String get logo => _logo;

  @override
  LiveDanmaku getDanmaku() {
    switch (id.toLowerCase()) {
      case 'bilibili':
        return BiliBiliDanmaku();
      case 'douyu':
        return DouyuDanmaku();
      case 'huya':
        return HuyaDanmaku();
      case 'douyin':
        return DouyinDanmaku();
      default:
        return LiveDanmaku();
    }
  }

  @override
  Future<List<LiveCategory>> getCategores() async {
    final result = await _invoke('getCategores', []);
    if (result is List) {
      return result.map(_toCategory).toList();
    }
    return [];
  }

  @override
  Future<LiveCategoryResult> getRecommendRooms({int page = 1}) async {
    final result = await _invoke('getRecommendRooms', [page]);
    return _toCategoryResult(result);
  }

  @override
  Future<LiveCategoryResult> getCategoryRooms(
    LiveSubCategory category, {
    int page = 1,
  }) async {
    final result = await _invoke('getCategoryRooms', [_categoryToJson(category), page]);
    return _toCategoryResult(result);
  }

  @override
  Future<LiveSearchRoomResult> searchRooms(String keyword, {int page = 1}) async {
    final result = await _invoke('searchRooms', [keyword, page]);
    if (result is Map) {
      return LiveSearchRoomResult(
        hasMore: result['hasMore'] == true,
        items: _toList(result['items']).map(_toRoomItem).toList(),
      );
    }
    return LiveSearchRoomResult(hasMore: false, items: []);
  }

  @override
  Future<LiveSearchAnchorResult> searchAnchors(String keyword, {int page = 1}) async {
    final result = await _invoke('searchAnchors', [keyword, page]);
    if (result is Map) {
      return LiveSearchAnchorResult(
        hasMore: result['hasMore'] == true,
        items: _toList(result['items']).map(_toAnchorItem).toList(),
      );
    }
    return LiveSearchAnchorResult(hasMore: false, items: []);
  }

  @override
  Future<LiveRoomDetail> getRoomDetail({required String roomId}) async {
    final result = await _invoke('getRoomDetail', [roomId]);
    return _toRoomDetail(result, roomId);
  }

  @override
  Future<bool> getLiveStatus({required String roomId}) async {
    final result = await _invoke('getLiveStatus', [roomId]);
    return result == true;
  }

  @override
  Future<List<LivePlayQuality>> getPlayQualites({required LiveRoomDetail detail}) async {
    final result = await _invoke('getPlayQualites', [_roomDetailToJson(detail)]);
    if (result is List) {
      return result.map(_toPlayQuality).toList();
    }
    return [];
  }

  @override
  Future<LivePlayUrl> getPlayUrls({
    required LiveRoomDetail detail,
    required LivePlayQuality quality,
  }) async {
    final result = await _invoke(
      'getPlayUrls',
      [_roomDetailToJson(detail), _playQualityToJson(quality)],
    );
    return _toPlayUrl(result);
  }

  @override
  Future<List<LiveSuperChatMessage>> getSuperChatMessage({required String roomId}) async {
    final result = await _invoke('getSuperChatMessage', [roomId]);
    if (result is List) {
      return result.map(_toSuperChat).toList();
    }
    return [];
  }

  /// 释放 JS 引擎资源
  void dispose() {
    _js.dispose();
  }

  // ============================================================
  // 核心调度：执行 JS 函数并处理请求描述符链
  // ============================================================

  /// 调用 JS 全局函数 [fnName]，参数 [args] 为 JSON 可序列化列表。
  ///
  /// 若返回请求描述符，则执行 HTTP 请求后调用 parse 函数，循环直至拿到最终结果。
  Future<dynamic> _invoke(String fnName, List<dynamic> args) async {
    if (!_js.hasFunction(fnName)) {
      throw CoreError('JS 脚本未实现函数: $fnName');
    }
    dynamic current = _js.callGlobalJson(fnName, args);
    int depth = 0;
    while (_isRequestDescriptor(current) && depth < 10) {
      depth++;
      current = await _executeRequest(current, fnName, args);
    }
    return current;
  }

  bool _isRequestDescriptor(dynamic v) {
    return v is Map && v.containsKey('url') && v.containsKey('parse');
  }

  /// 执行请求描述符，拿到响应后调用 parse 函数
  Future<dynamic> _executeRequest(
    Map descriptor,
    String callerFn,
    List<dynamic> callerArgs,
  ) async {
    final url = descriptor['url']?.toString() ?? '';
    final method = (descriptor['method']?.toString() ?? 'GET').toUpperCase();
    final headers = _toStringMap(descriptor['headers']);
    final data = descriptor['data'];
    final parseFn = descriptor['parse']?.toString() ?? '';

    String body;
    try {
      if (method == 'POST') {
        body = await HttpClient.instance.postJson(
          url,
          header: headers,
          data: data,
        ) as String;
      } else {
        body = await HttpClient.instance.getText(
          url,
          header: headers,
        );
      }
    } catch (e) {
      throw CoreError('JS 站点请求失败 [$method $url]: $e');
    }

    if (parseFn.isEmpty) {
      return body;
    }
    if (!_js.hasFunction(parseFn)) {
      throw CoreError('JS 脚本未实现解析函数: $parseFn');
    }
    // parse(body, ...originalArgs)
    final parseArgs = <dynamic>[body, ...callerArgs];
    return _js.callGlobalJson(parseFn, parseArgs);
  }

  // ============================================================
  // JSON -> Dart model 转换
  // ============================================================

  LiveCategory _toCategory(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    final children = _toList(m['children']).map(_toSubCategory).toList();
    return LiveCategory(
      id: m['id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      children: children,
    );
  }

  LiveSubCategory _toSubCategory(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return LiveSubCategory(
      id: m['id']?.toString() ?? '',
      name: m['name']?.toString() ?? '',
      parentId: m['parentId']?.toString() ?? '',
      pic: m['pic']?.toString(),
    );
  }

  LiveCategoryResult _toCategoryResult(dynamic v) {
    if (v is Map) {
      return LiveCategoryResult(
        hasMore: v['hasMore'] == true,
        items: _toList(v['items']).map(_toRoomItem).toList(),
      );
    }
    return LiveCategoryResult(hasMore: false, items: []);
  }

  LiveRoomItem _toRoomItem(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return LiveRoomItem(
      roomId: m['roomId']?.toString() ?? '',
      title: m['title']?.toString() ?? '',
      cover: m['cover']?.toString() ?? '',
      userName: m['userName']?.toString() ?? '',
      online: _toInt(m['online']),
    );
  }

  LiveAnchorItem _toAnchorItem(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return LiveAnchorItem(
      roomId: m['roomId']?.toString() ?? '',
      avatar: m['avatar']?.toString() ?? '',
      userName: m['userName']?.toString() ?? '',
      liveStatus: m['liveStatus'] == true,
    );
  }

  LiveRoomDetail _toRoomDetail(dynamic v, String fallbackRoomId) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return LiveRoomDetail(
      roomId: m['roomId']?.toString() ?? fallbackRoomId,
      title: m['title']?.toString() ?? '',
      cover: m['cover']?.toString() ?? '',
      userName: m['userName']?.toString() ?? '',
      userAvatar: m['userAvatar']?.toString() ?? '',
      online: _toInt(m['online']),
      introduction: m['introduction']?.toString(),
      notice: m['notice']?.toString(),
      status: m['status'] == true,
      data: m['data'],
      danmakuData: decodeDanmakuData(m['danmakuData'], id),
      url: m['url']?.toString() ?? '',
      isRecord: m['isRecord'] == true,
      showTime: m['showTime']?.toString(),
    );
  }

  LivePlayQuality _toPlayQuality(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return LivePlayQuality(
      quality: m['quality']?.toString() ?? '',
      data: m['data'],
      sort: _toInt(m['sort']),
    );
  }

  LivePlayUrl _toPlayUrl(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    final urls = _toList(m['urls']).map((e) => e.toString()).toList();
    final headers = _toStringMap(m['headers']);
    return LivePlayUrl(urls: urls, headers: headers);
  }

  LiveSuperChatMessage _toSuperChat(dynamic v) {
    final m = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return LiveSuperChatMessage(
      userName: m['userName']?.toString() ?? '',
      face: m['face']?.toString() ?? '',
      message: m['message']?.toString() ?? '',
      price: _toInt(m['price']),
      startTime: _toDateTime(m['startTime']) ?? DateTime.now(),
      endTime: _toDateTime(m['endTime']) ?? DateTime.now(),
      backgroundColor: m['backgroundColor']?.toString() ?? '',
      backgroundBottomColor: m['backgroundBottomColor']?.toString() ?? '',
    );
  }

  // ============================================================
  // model -> JSON（传给 JS 的参数）
  // ============================================================

  Map<String, dynamic> _categoryToJson(LiveSubCategory c) => {
        'id': c.id,
        'name': c.name,
        'parentId': c.parentId,
        'pic': c.pic,
      };

  Map<String, dynamic> _roomDetailToJson(LiveRoomDetail d) => {
        'roomId': d.roomId,
        'title': d.title,
        'cover': d.cover,
        'userName': d.userName,
        'userAvatar': d.userAvatar,
        'online': d.online,
        'introduction': d.introduction,
        'notice': d.notice,
        'status': d.status,
        'data': d.data,
        'danmakuData': encodeDanmakuData(d.danmakuData, id),
        'url': d.url,
        'isRecord': d.isRecord,
        'showTime': d.showTime,
      };

  Map<String, dynamic> _playQualityToJson(LivePlayQuality q) => {
        'quality': q.quality,
        'data': q.data,
        'sort': q.sort,
      };

  // ============================================================
  // 辅助
  // ============================================================

  List _toList(dynamic v) => v is List ? v : [];

  Map<String, String> _toStringMap(dynamic v) {
    if (v is! Map) return {};
    return v.map((k, val) => MapEntry(k.toString(), val.toString()));
  }

  int _toInt(dynamic v) {
    if (v is int) return v;
    if (v is double) return v.toInt();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }

  DateTime? _toDateTime(dynamic v) {
    if (v == null) return null;
    if (v is int) {
      return DateTime.fromMillisecondsSinceEpoch(v);
    }
    if (v is String) {
      return DateTime.tryParse(v);
    }
    return null;
  }
}
