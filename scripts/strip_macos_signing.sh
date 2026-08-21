#!/usr/bin/env bash
# CI 构建前移除 macOS 工程的开发者签名配置（Team + Apple Development 身份），
# 使 CI 在无证书环境回退为 ad-hoc 签名（与 Flutter 官方模板一致）。
# 仅作用于 CI checkout 的工作副本，不影响仓库内文件与本地 Xcode 开发。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PBXPROJ="$SCRIPT_DIR/../simple_live_app/macos/Runner.xcodeproj/project.pbxproj"

# 删除所有 DEVELOPMENT_TEAM 行（兼容任意 Team ID）
perl -pi -e 's/^[ \t]*DEVELOPMENT_TEAM = [A-Z0-9]+;\n//' "$PBXPROJ"

# SDK 级签名身份 "Apple Development" -> ad-hoc "-"
perl -pi -e 's/"CODE_SIGN_IDENTITY\[sdk=macosx\*\]" = "Apple Development";/"CODE_SIGN_IDENTITY[sdk=macosx*]" = "-";/g' "$PBXPROJ"

# 校验：不允许残留非空 DEVELOPMENT_TEAM（防止 pbxproj 格式漂移导致静默漏删）
if grep -Eq 'DEVELOPMENT_TEAM = [A-Z0-9]' "$PBXPROJ"; then
  echo "::error::macOS pbxproj 仍包含 DEVELOPMENT_TEAM，CI 将因缺少签名证书而失败，请更新脚本匹配规则。" >&2
  exit 1
fi
echo "macOS signing stripped for CI (ad-hoc build)."
