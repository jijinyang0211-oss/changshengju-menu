#!/bin/bash
# 长生居·私房菜 一键部署脚本（支持 Ubuntu / Debian / CentOS / Alibaba Cloud Linux）
# 用法: bash server-deploy.sh
set -e

echo "==> 1/5 检测系统并安装基础工具"
# 检测包管理器
if command -v apt-get >/dev/null 2>&1; then
  PKG="apt-get"
  export DEBIAN_FRONTEND=noninteractive
  $PKG update -y
  $PKG install -y curl git
  NODE_SETUP="https://deb.nodesource.com/setup_20.x"
elif command -v dnf >/dev/null 2>&1; then
  PKG="dnf"
  $PKG install -y curl git
  NODE_SETUP="https://rpm.nodesource.com/setup_20.x"
else
  PKG="yum"
  $PKG install -y curl git
  NODE_SETUP="https://rpm.nodesource.com/setup_20.x"
fi
echo "   包管理器: $PKG"

echo "==> 2/5 安装 Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "$NODE_SETUP" | bash -
  $PKG install -y nodejs
fi
node -v

echo "==> 3/5 拉取项目代码（幂等更新，保留订单数据）"
APP_DIR="/opt/changshengju-menu"
REPO="https://github.com/jijinyang0211-oss/changshengju-menu.git"
if [ -d "$APP_DIR/.git" ]; then
  # 已部署过：仅更新代码，orders.json 不入 git 会被保留
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
else
  # 首次部署：克隆仓库
  rm -rf "$APP_DIR"
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# 订单数据文件不入 git，首次部署时创建空文件（已存在则保留线上订单）
if [ ! -f "$APP_DIR/orders.json" ]; then
  echo '{"orders":[]}' > "$APP_DIR/orders.json"
fi

# 菜品图片映射不入 git，首次部署时创建空对象（已存在则保留管理员改图）
if [ ! -f "$APP_DIR/images.json" ]; then
  echo '{}' > "$APP_DIR/images.json"
fi

npm install --omit=dev

echo "==> 4/5 安装 PM2 并启动服务"
npm install -g pm2
pm2 delete changshengju 2>/dev/null || true
pm2 start server.js --name changshengju
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 || true

echo "==> 5/5 完成"
echo ""
echo "================================================"
PUBLIC_IP=$(curl -s --connect-timeout 5 ifconfig.me || echo "你的公网IP")
echo " 部署完成！网站地址: http://${PUBLIC_IP}:3000"
echo " 管理后台: http://${PUBLIC_IP}:3000/admin"
echo "================================================"
echo " 注意：如果打不开，请到云控制台安全组放行 3000 端口"
