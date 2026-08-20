const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'changshouju2024';

const MENU_FILE = path.join(__dirname, 'menu.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');
const IMAGES_FILE = path.join(__dirname, 'images.json');

app.use(express.json());
// 静态文件：HTML 不缓存（改版后用户立即看到最新），图片等静态资源可缓存
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`读取数据文件失败 ${file}:`, err);
    return fallback;
  }
}

// 原子写入：先写临时文件再 rename，避免写入中途崩溃损坏数据
function writeJSON(file, data) {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return true;
  } catch (err) {
    console.error(`写入数据文件失败 ${file}:`, err);
    return false;
  }
}

function readMenu() {
  return readJSON(MENU_FILE, { menu: [], config: {} });
}

function readOrders() {
  return readJSON(ORDERS_FILE, { orders: [] });
}

function writeMenu(data) {
  return writeJSON(MENU_FILE, data);
}

function writeOrders(data) {
  return writeJSON(ORDERS_FILE, data);
}

// 菜品图片映射：独立存储（不入 git），管理员改图后不被部署覆盖
function readImageMap() {
  return readJSON(IMAGES_FILE, {});
}

function writeImageMap(map) {
  return writeJSON(IMAGES_FILE, map);
}

// 将图片映射覆盖到菜单上
function applyImageMap(menuData) {
  const map = readImageMap();
  (menuData.menu || []).forEach(dish => {
    if (map[dish.id] !== undefined) dish.image = map[dish.id];
  });
  return menuData;
}

// 管理操作鉴权：写接口需携带正确 token
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token === ADMIN_TOKEN) return next();
  res.status(401).json({ error: '未授权' });
}

app.post('/api/admin/login', (req, res) => {
  const { token } = req.body;
  if (token === ADMIN_TOKEN) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

app.get('/api/menu', (req, res) => {
  const data = applyImageMap(readMenu());
  const categories = [...new Set(data.menu.map(item => item.category))];
  res.json({
    menu: data.menu,
    categories,
    config: data.config
  });
});

app.post('/api/order', (req, res) => {
  const { name, date, time, guests, restrictions, wishDishes, selectedDishes } = req.body;
  
  if (!name || !date || !time || !guests || !selectedDishes || selectedDishes.length === 0) {
    return res.status(400).json({ error: '请填写完整预订信息并选择菜品' });
  }

  const menuData = readMenu();
  const ordersData = readOrders();
  const newOrder = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    name,
    date,
    time,
    guests: parseInt(guests),
    restrictions: restrictions || '',
    wishDishes: wishDishes || '',
    dishes: selectedDishes.map(id => {
      const dish = menuData.menu.find(m => m.id === parseInt(id));
          return dish
            ? { id: dish.id, name: dish.name, ingredients: dish.ingredients || [] }
            : { id: parseInt(id), name: '未知菜品', ingredients: [] };
    }),
    status: '待确认',
    createdAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  };

  ordersData.orders.unshift(newOrder);
  writeOrders(ordersData);
  
  res.json({ success: true, order: newOrder });
});

// 更新订单（编辑预订）
app.put('/api/order/:id', (req, res) => {
  const { id } = req.params;
  const { name, date, time, guests, restrictions, wishDishes, selectedDishes } = req.body;

  if (!name || !date || !time || !guests || !selectedDishes || selectedDishes.length === 0) {
    return res.status(400).json({ error: '请填写完整预订信息并选择菜品' });
  }

  const menuData = readMenu();
  const ordersData = readOrders();
  const order = ordersData.orders.find(o => o.id === parseInt(id));
  if (!order) return res.status(404).json({ error: '订单不存在' });

  order.name = name;
  order.date = date;
  order.time = time;
  order.guests = parseInt(guests);
  order.restrictions = restrictions || '';
  order.wishDishes = wishDishes || '';
  order.dishes = selectedDishes.map(sid => {
    const dish = menuData.menu.find(m => m.id === parseInt(sid));
    return dish
      ? { id: dish.id, name: dish.name, ingredients: dish.ingredients || [] }
      : { id: parseInt(sid), name: '未知菜品', ingredients: [] };
  });
  writeOrders(ordersData);

  res.json({ success: true, order });
});

app.get('/api/images', (req, res) => {
  const files = fs.readdirSync(path.join(__dirname, 'public'))
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f))
    .sort();
  res.json({ images: files });
});

app.post('/api/dish-image', requireAdmin, (req, res) => {
  const { id, image } = req.body;
  if (!id || !image) {
    return res.status(400).json({ error: '缺少菜品ID或图片名' });
  }
  const dishId = parseInt(id);
  const menuData = readMenu();
  const dish = menuData.menu.find(m => m.id === dishId);
  if (!dish) {
    return res.status(404).json({ error: '菜品不存在' });
  }
  const map = readImageMap();
  map[dishId] = image;
  writeImageMap(map);
  res.json({ success: true });
});

app.get('/api/orders', (req, res) => {
  const data = readOrders();
  res.json({ orders: data.orders });
});

app.post('/api/order/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const data = readOrders();
  const order = data.orders.find(o => o.id === parseInt(id));
  if (order) {
    order.status = status;
    writeOrders(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '订单不存在' });
  }
});

app.delete('/api/order/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const data = readOrders();
  const index = data.orders.findIndex(o => o.id === parseInt(id));
  if (index > -1) {
    data.orders.splice(index, 1);
    writeOrders(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: '订单不存在' });
  }
});

app.get('/admin', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/match', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(__dirname, 'public', 'match.html'));
});

app.listen(PORT, () => {
  console.log(`长生居·私房菜 服务器已启动`);
  console.log(`用户页面: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin`);
});
