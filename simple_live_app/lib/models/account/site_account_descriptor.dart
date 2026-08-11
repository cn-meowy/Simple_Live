/// 站点账号描述符
///
/// 由后端 `/api/v1/sites` 返回的 `account` 字段解析而来，
/// 描述前端应渲染哪种账号设置页。
enum SiteAccountType {
  /// 二维码扫码登录（仅当前站点支持时返回）
  qr,

  /// 手动输入 Cookie
  cookie,

  /// 手动输入用户名
  username,

  /// 不显示账号设置
  none;

  static SiteAccountType fromString(String? value) {
    switch (value) {
      case 'qr':
        return SiteAccountType.qr;
      case 'cookie':
        return SiteAccountType.cookie;
      case 'username':
        return SiteAccountType.username;
      default:
        return SiteAccountType.none;
    }
  }
}

/// 站点账号描述符
///
/// 对应后端 JSON：
/// ```json
/// { "type": "qr", "label": "扫码登录", "hint": "使用哔哩哔哩 App 扫码登录" }
/// ```
class SiteAccountDescriptor {
  final SiteAccountType type;
  final String label;
  final String hint;

  const SiteAccountDescriptor({
    required this.type,
    required this.label,
    required this.hint,
  });

  factory SiteAccountDescriptor.fromJson(Map<String, dynamic> json) {
    return SiteAccountDescriptor(
      type: SiteAccountType.fromString(json['type'] as String?),
      label: (json['label'] as String?) ?? '',
      hint: (json['hint'] as String?) ?? '',
    );
  }

  /// null 表示该站点不需要账号设置
  static SiteAccountDescriptor? fromJsonOrNull(Map<String, dynamic>? json) {
    if (json == null) return null;
    return SiteAccountDescriptor.fromJson(json);
  }
}