import 'package:dio/dio.dart';

/// 重定向拦截器
///
/// 手动处理 3xx 重定向，解决 `dart:io` 内置 `HttpClient` 在跟随 POST 等带请求体的
/// 请求重定向时，无法重放请求体导致原始 3xx 响应被直接抛出的问题
/// （常见于服务端部署在 nginx 等反向代理后，对 http 请求 301/302 跳转到 https）。
///
/// 配合 [BaseOptions.followRedirects] = `false` 使用：关闭 `dart:io` 的自动跟随，
/// 由本拦截器在 [onError] 中捕获 3xx 响应，用响应头 `Location` 重新发起请求。
///
/// 为兼容 `POST /play-urls` 等需要保持方法与请求体的接口，重定向时**保持原方法和
/// 请求体**（按 307/308 语义处理 301/302/303），避免被转为 GET 导致服务端 405。
class RedirectInterceptor extends Interceptor {
  final Dio dio;
  final int maxRedirects;

  RedirectInterceptor(this.dio, {this.maxRedirects = 5});

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final response = err.response;
    final code = response?.statusCode;
    if (response == null || code == null) {
      return handler.next(err);
    }
    if (!_isRedirect(code)) {
      return handler.next(err);
    }

    final location = response.headers.value('location');
    if (location == null) {
      return handler.next(err);
    }

    final redirectCount = _redirectCount(response.requestOptions) + 1;
    if (redirectCount > maxRedirects) {
      return handler.next(err);
    }

    final newUrl = location.startsWith('http')
        ? location
        : response.requestOptions.uri.resolve(location).toString();

    try {
      final newOptions = response.requestOptions.copyWith(
        path: newUrl,
        extra: {
          ...response.requestOptions.extra,
          _kRedirectCount: redirectCount,
        },
      );
      final result = await dio.fetch(newOptions);
      handler.resolve(result);
    } catch (e) {
      handler.next(err);
    }
  }

  bool _isRedirect(int code) =>
      code == 301 || code == 302 || code == 303 || code == 307 || code == 308;

  int _redirectCount(RequestOptions options) {
    final v = options.extra[_kRedirectCount];
    if (v is int) return v;
    return 0;
  }

  static const String _kRedirectCount = '__redirect_count';
}
