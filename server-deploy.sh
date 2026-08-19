#!/bin/bash
# 长生居·私房菜 一键部署脚本（Ubuntu 22.04）
# 用法: bash server-deploy.sh
set -e

echo "==> 1/5 更新系统并安装基础工具"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git

echo "==> 2/5 安装 Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 3/5 拉取项目代码"
rm -rf /opt/changshengju-menu
git clone https://github.com/jijinyang0211-oss/changshengju-menu.git /opt/changshengju-menu
cd /opt/changshengju-menu
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
echo " 部署完成！网站地址: http://$(hostname -I | awk '{print $1}'):3000"
echo " 管理后台: http://$(hostname -I | awk '{print $1}'):3000/admin"
echo "================================================"
echo " 注意：如果打不开，请到云控制台安全组放行 3000 端口"
