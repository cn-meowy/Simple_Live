import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:get/get.dart';
import 'package:path_provider/path_provider.dart';
import 'package:simple_live_app/app/controller/app_settings_controller.dart';
import 'package:simple_live_app/app/log.dart';
import 'package:simple_live_app/app/sites.dart';
import 'package:simple_live_app/core/script_live_site.dart';
import 'package:simple_live_app/services/local_storage_service.dart';

/// JS 站点元数据
class ScriptSiteMeta {
  /// 内部唯一标识（UUID），区别于站点自身上报的 siteId
  final String uuid;

  /// JS 上报的站点 id（bilibili/douyu/...）
  final String siteId;

  /// 站点名称
  final String name;

  /// logo（URL 或资源标识，可空）
  final String? logo;

  /// 下载来源 URL
  final String jsUrl;

  /// 本地 JS 文件相对路径（相对文档目录）
  final String localPath;

  /// 是否启用
  final bool enabled;

  /// 安装时间戳（毫秒）
  final int createdAt;

  ScriptSiteMeta({
    required this.uuid,
    required this.siteId,
    required this.name,
    this.logo,
    required this.jsUrl,
    required this.localPath,
    this.enabled = true,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'uuid': uuid,
        'siteId': siteId,
        'name': name,
        'logo': logo,
        'jsUrl': jsUrl,
        'localPath': localPath,
        'enabled': enabled,
        'createdAt': createdAt,
      };

  factory ScriptSiteMeta.fromJson(Map<String, dynamic> json) => ScriptSiteMeta(
        uuid: json['uuid']?.toString() ?? '',
        siteId: json['siteId']?.toString() ?? '',
        name: json['name']?.toString() ?? '',
        logo: json['logo']?.toString(),
        jsUrl: json['jsUrl']?.toString() ?? '',
        localPath: json['localPath']?.toString() ?? '',
        enabled: json['enabled'] != false,
        createdAt: json['createdAt'] is int
            ? json['createdAt'] as int
            : DateTime.now().millisecondsSinceEpoch,
      );

  ScriptSiteMeta copyWith({
    String? uuid,
    String? siteId,
    String? name,
    String? logo,
    String? jsUrl,
    String? localPath,
    bool? enabled,
    int? createdAt,
  }) =>
      ScriptSiteMeta(
        uuid: uuid ?? this.uuid,
        siteId: siteId ?? this.siteId,
        name: name ?? this.name,
        logo: logo ?? this.logo,
        jsUrl: jsUrl ?? this.jsUrl,
        localPath: localPath ?? this.localPath,
        enabled: enabled ?? this.enabled,
        createdAt: createdAt ?? this.createdAt,
      );
}

/// JS 站点安装结果
class ScriptSiteInstallResult {
  final ScriptSiteMeta meta;
  final ScriptLiveSite site;
  ScriptSiteInstallResult(this.meta, this.site);
}

/// JS 站点管理服务
///
/// 负责 JS 文件的下载、本地持久化（文件 + Hive 元数据）、
/// 以及 ScriptLiveSite 实例的构造与缓存。
class ScriptSiteService extends GetxService {
  static ScriptSiteService get instance => Get.find<ScriptSiteService>();

  static const String _kScriptSites = "ScriptSites";

  /// 文档目录下的子目录名
  static const String _dirName = "script_sites";

  /// 已安装站点元数据列表（响应式，供 UI 绑定）
  final RxList<ScriptSiteMeta> sites = <ScriptSiteMeta>[].obs;

  /// 已构造的 ScriptLiveSite 缓存（uuid -> 实例）
  final Map<String, ScriptLiveSite> _siteCache = {};

  String? _docsDir;

  @override
  void onInit() {
    super.onInit();
    _load();
    // 构建 Sites.allSites，使后续 AppSettingsController.initSiteSort 能纳入 JS 站点
    Sites.reload();
  }

  /// 读取持久化的元数据
  void _load() {
    try {
      final raw = LocalStorageService.instance
          .getValue<String>(_kScriptSites, '');
      if (raw.isEmpty) return;
      final list = jsonDecode(raw) as List;
      sites.value = list
          .map((e) => ScriptSiteMeta.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList();
    } catch (e, s) {
      Log.e('ScriptSiteService 读取失败: $e', s);
    }
  }

  /// 持久化元数据
  Future _persist() async {
    final raw = jsonEncode(sites.map((e) => e.toJson()).toList());
    await LocalStorageService.instance.setValue<String>(_kScriptSites, raw);
  }

  Future<String> _getDocsDir() async {
    _docsDir ??= (await getApplicationDocumentsDirectory()).path;
    return _docsDir!;
  }

  Future<String> _ensureDir() async {
    final docs = await _getDocsDir();
    final dir = Directory('$docs/$_dirName');
    if (!await dir.exists()) {
      await dir.create(recursive: true);
    }
    return dir.path;
  }

  /// 根据 uuid 获取已构造的 ScriptLiveSite
  ///
  /// 启用的站点会被缓存；禁用的站点返回 null。
  ScriptLiveSite? getSite(String uuid) {
    final meta = sites.firstWhereOrNull((e) => e.uuid == uuid);
    if (meta == null || !meta.enabled) return null;
    return _siteCache[uuid] ??= _buildSite(meta);
  }

  /// 获取所有已启用站点对应的 (uuid -> ScriptLiveSite)
  Map<String, ScriptLiveSite> getEnabledSites() {
    final result = <String, ScriptLiveSite>{};
    for (final meta in sites) {
      if (!meta.enabled) continue;
      final site = getSite(meta.uuid);
      if (site != null) {
        result[meta.uuid] = site;
      }
    }
    return result;
  }

  /// 构造一个 ScriptLiveSite（读取本地 JS 文件）
  ScriptLiveSite _buildSite(ScriptSiteMeta meta) {
    final docsDir = _docsDir;
    final filePath = docsDir == null
        ? meta.localPath
        : '$docsDir/${meta.localPath}';
    final file = File(filePath);
    if (!file.existsSync()) {
      Log.w('JS 站点文件不存在: ${meta.uuid} -> $filePath');
    }
    final source = file.existsSync() ? file.readAsStringSync() : '';
    final site = ScriptLiveSite(jsSource: source);
    // 用持久化的元数据覆盖（防止 JS 缺失 getSiteInfo）
    site.setMeta(id: meta.siteId, name: meta.name, logo: meta.logo);
    return site;
  }

  /// 从 [url] 下载 JS 并安装
  ///
  /// 下载后会执行一次 getSiteInfo 读取站点信息，校验通过后持久化。
  /// 安装完成后会释放本次预览用的 ScriptLiveSite。
  Future<ScriptSiteInstallResult> downloadAndInstall(String url) async {
    final dio = Dio();
    try {
      Log.i('下载 JS 站点: $url');
      final resp = await dio.get<String>(
        url,
        options: Options(responseType: ResponseType.plain),
      );
      final source = resp.data ?? '';
      if (source.trim().isEmpty) {
        throw '下载的 JS 文件内容为空';
      }

      // 预览站点信息
      final preview = ScriptLiveSite(jsSource: source);
      final siteId = preview.id;
      final name = preview.name;
      if (siteId.isEmpty) {
        preview.dispose();
        throw 'JS 脚本未通过 getSiteInfo 上报有效站点 id';
      }

      // 写入本地文件
      final dirPath = await _ensureDir();
      final uuid = _generateUuid();
      final fileName = '$uuid.js';
      final file = File('$dirPath/$fileName');
      await file.writeAsString(source);
      preview.dispose();

      final meta = ScriptSiteMeta(
        uuid: uuid,
        siteId: siteId,
        name: name.isEmpty ? siteId : name,
        logo: preview.logo.isEmpty ? null : preview.logo,
        jsUrl: url,
        localPath: '$_dirName/$fileName',
        enabled: true,
        createdAt: DateTime.now().millisecondsSinceEpoch,
      );

      sites.add(meta);
      await _persist();
      // 清理可能存在的旧缓存，构造正式实例
      _siteCache.remove(uuid);
      final site = getSite(uuid)!;
      // 重建 Sites 并将新站点追加到排序末尾，使重启后出现在标签页
      Sites.reload();
      _appendSiteSort(uuid);
      Log.i('JS 站点安装成功: ${meta.name}(${meta.siteId})');
      return ScriptSiteInstallResult(meta, site);
    } catch (e, s) {
      Log.e('JS 站点安装失败: $e', s);
      rethrow;
    } finally {
      dio.close(force: true);
    }
  }

  /// 卸载站点
  Future uninstall(String uuid) async {
    final meta = sites.firstWhereOrNull((e) => e.uuid == uuid);
    if (meta == null) return;
    // 删除文件
    final docsDir = _docsDir;
    if (docsDir != null) {
      final file = File('$docsDir/${meta.localPath}');
      if (file.existsSync()) {
        try {
          await file.delete();
        } catch (e) {
          Log.w('删除 JS 文件失败: $e');
        }
      }
    }
    // 释放缓存
    _siteCache.remove(uuid)?.dispose();
    sites.removeWhere((e) => e.uuid == uuid);
    await _persist();
    Sites.reload();
    _removeSiteSort(uuid);
    Log.i('JS 站点已卸载: ${meta.name}');
  }

  /// 启用/禁用站点
  Future setEnabled(String uuid, bool enabled) async {
    final idx = sites.indexWhere((e) => e.uuid == uuid);
    if (idx < 0) return;
    sites[idx] = sites[idx].copyWith(enabled: enabled);
    if (!enabled) {
      _siteCache.remove(uuid)?.dispose();
    }
    await _persist();
    Sites.reload();
    if (enabled) {
      _appendSiteSort(uuid);
    } else {
      _removeSiteSort(uuid);
    }
  }

  /// 更新站点（重新下载覆盖本地文件）
  Future<ScriptSiteInstallResult> update(String uuid) async {
    final meta = sites.firstWhereOrNull((e) => e.uuid == uuid);
    if (meta == null) throw '站点不存在';
    // 先卸载缓存
    _siteCache.remove(uuid)?.dispose();
    // 复用安装逻辑，但保留原 uuid 与排序
    final result = await downloadAndInstall(meta.jsUrl);
    // 用原 uuid 替换新记录
    sites.removeWhere((e) => e.uuid == result.meta.uuid);
    final updated = result.meta.copyWith(
      uuid: uuid,
      createdAt: meta.createdAt,
      enabled: meta.enabled,
    );
    sites.add(updated);
    await _persist();
    // 重新下载会写入新文件名，这里删除旧文件
    final docsDir = _docsDir;
    if (docsDir != null) {
      final oldFile = File('$docsDir/${meta.localPath}');
      if (oldFile.existsSync()) {
        try {
          await oldFile.delete();
        } catch (_) {}
      }
    }
    _siteCache.remove(uuid);
    final site = getSite(uuid)!;
    Sites.reload();
    return ScriptSiteInstallResult(updated, site);
  }

  /// 释放所有缓存的 JS 引擎
  void disposeAll() {
    for (final s in _siteCache.values) {
      s.dispose();
    }
    _siteCache.clear();
  }

  String _generateUuid() {
    final now = DateTime.now().millisecondsSinceEpoch;
    final rand = (now % 100000).toString().padLeft(5, '0');
    return 'site_${now}_$rand';
  }

  /// 将站点 uuid 追加到站点排序末尾（若不存在）
  void _appendSiteSort(String uuid) {
    try {
      final sort = AppSettingsController.instance.siteSort;
      if (!sort.contains(uuid)) {
        sort.add(uuid);
        AppSettingsController.instance.setSiteSort(sort.toList());
      }
    } catch (e) {
      Log.w('追加站点排序失败: $e');
    }
  }

  /// 从站点排序中移除 uuid
  void _removeSiteSort(String uuid) {
    try {
      final sort = AppSettingsController.instance.siteSort;
      if (sort.contains(uuid)) {
        sort.remove(uuid);
        AppSettingsController.instance.setSiteSort(sort.toList());
      }
    } catch (e) {
      Log.w('移除站点排序失败: $e');
    }
  }
}
