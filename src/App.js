// App.js
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Supabase bağlantısı
import uploadProductsFromCSV from "./uploadProducts"; // CSV yükleme fonksiyonu

// Formatlama fonksiyonu: Sayısal değerleri Türkçe biçimde, binlik ayırıcı ve iki ondalık ile gösterir.
function formatCurrency(amount) {
  if (!amount) return "0,00 ₺";
  return amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " ₺";
}

function App() {
  const [products, setProducts] = useState([]); 
  const [orderQuantities, setOrderQuantities] = useState({}); 
  const [selectedCategory, setSelectedCategory] = useState("Tümü");
  const [categories, setCategories] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  function normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/ı/g, "i")
      .replace(/ç/g, "c")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ö/g, "o");
  }

  // Sayfa açılır açılmaz Supabase'den ürünleri çekiyoruz.
  useEffect(() => {
    async function fetchProducts() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*');
        
        if (error) {
          console.error("Ürünleri çekerken hata oluştu:", error);
          return;
        }
        
        const productList = data.map(item => ({
          id: item.id,
          stockCode: item.stockCode || "Bilinmiyor",
          name: item.name || "Bilinmiyor",
          price: item.price ? parseFloat(item.price) : 0,
          stock: item.stock ? parseInt(item.stock, 10) : 0,
          category: item.category || "Diğer",
          vatRate: item.vatRate ? parseFloat(item.vatRate) : 18,
          unit: item.unit || "Adet"
        }));
        
        setProducts(productList);
        const categoryList = [...new Set(productList.map(p => p.category))];
        setCategories(["Tümü", ...categoryList]);
      } catch (error) {
        console.error("Ürünleri çekerken hata oluştu:", error);
      }
    }
    fetchProducts();
  }, []);

  // Sipariş miktarındaki değişiklikleri takip eden fonksiyon.
  const handleQuantityChange = (productId, value, maxStock) => {
    let quantity = parseInt(value, 10);
    if (isNaN(quantity) || quantity < 0) quantity = 0;
    if (quantity > maxStock) quantity = maxStock;
    setOrderQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  // Sipariş gönderme işlemi.
  const handleOrderSubmit = async () => {
    if (!customerName.trim()) {
      alert("Lütfen firma adınızı girin!");
      return;
    }

    const ordersToSend = [];
    const updatedProducts = [...products];

    for (const product of products) {
      const quantity = parseInt(orderQuantities[product.id] || "0", 10);
      if (quantity > 0 && quantity <= product.stock) {
        ordersToSend.push({
          customerName: customerName.trim(),
          stockCode: product.stockCode,
          productId: product.id,
          productName: product.name,
          quantity: quantity,
          price: product.price,
          vatRate: product.vatRate,
          whitePrice: product.price * (1 + (product.vatRate / 200)),
          totalPrice: product.price * quantity * (1 + product.vatRate / 100),
          unit: product.unit,
          timestamp: new Date()
        });
        updatedProducts.find(p => p.id === product.id).stock -= quantity;
      }
    }

    if (ordersToSend.length === 0) {
      alert("Sipariş için geçerli miktar girilmedi!");
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .insert(ordersToSend);

    if (error) {
      console.error("Sipariş ekleme hatası:", error);
      alert("Sipariş eklenirken hata oluştu!");
      return;
    }

    for (const product of products) {
      const quantity = parseInt(orderQuantities[product.id] || "0", 10);
      if (quantity > 0 && quantity <= product.stock + quantity) {
        const newStock = product.stock - quantity;
        const { error: updateError } = await supabase
          .from('products')
          .update({ stock: newStock })
          .eq('id', product.id);
        if (updateError) {
          console.error("Stok güncelleme hatası:", updateError);
        }
      }
    }

    setProducts(updatedProducts);
    setOrderQuantities({});
    setCustomerName(""); 
    alert("Sipariş başarıyla gönderildi!");
  };

  // Toplam hesaplamalar
  const totalOrderAmount = Object.entries(orderQuantities).reduce((acc, [productId, quantity]) => {
    const product = products.find(p => p.id === productId);
    return acc + (product ? product.price * parseInt(quantity || "0", 10) : 0);
  }, 0);

  const totalOrderAmountWithVAT = Object.entries(orderQuantities).reduce((acc, [productId, quantity]) => {
    const product = products.find(p => p.id === productId);
    const vatMultiplier = 1 + (product?.vatRate / 100 || 0);
    return acc + (product ? product.price * parseInt(quantity || "0", 10) * vatMultiplier : 0);
  }, 0);

  const totalWhitePriceAmount = Object.entries(orderQuantities).reduce((acc, [productId, quantity]) => {
    const product = products.find(p => p.id === productId);
    const whitePrice = product ? product.price * (1 + (product.vatRate / 200)) : 0;
    return acc + (whitePrice * parseInt(quantity || "0", 10));
  }, 0);

  return (
    <div style={{ padding: "10px" }}>
      <h1 style={{ textAlign: "center" }}>Overstock Sipariş Sistemi</h1>

      {/* Admin Girişi */}
      {!isAdmin && (
        <div style={{ textAlign: "center" }}>
          <h3>Admin Girişi</h3>
          <input
            type="password"
            placeholder="Şifrenizi girin"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
          />
          <button onClick={() => setIsAdmin(adminPassword === "Overstock2024!")}>Giriş Yap</button>
        </div>
      )}

      {/* Toplu Ürün Yükleme (Sadece Adminler İçin) */}
      {isAdmin && (
        <div style={{ textAlign: "center", marginBottom: "10px" }}>
          <h3>Ürünleri Toplu Yükle</h3>
          <input type="file" accept=".csv" onChange={(e) => uploadProductsFromCSV(e.target.files[0])} />
        </div>
      )}

      <label>Kategori Seç: </label>
      <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
        {categories.map(category => (
          <option key={category} value={category}>{category}</option>
        ))}
      </select>

      <div>
        <input
          type="text"
          placeholder="Ürün ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
        />
      </div>

      <div style={{ overflowX: "auto" }}>
        <table border="1" style={{ width: "100%", minWidth: "700px", textAlign: "center" }}>
          <thead>
            <tr>
              <th>Stok Kodu</th>
              <th>Ürün</th>
              <th>Birim</th>
              <th>Fiyat (KDV Hariç)</th>
              <th>Fiyat (KDV Dahil)</th>
              <th>Beyaz Fiyat</th>
              <th>Stok</th>
              <th>Sipariş Miktarı</th>
              <th>Tutar (KDV Dahil)</th>
              <th>Beyaz Fiyat Tutarı</th>
            </tr>
          </thead>
          <tbody>
            {products
              .filter(product => 
                (selectedCategory === "Tümü" || product.category === selectedCategory) &&
                (normalizeText(product.name).includes(normalizeText(searchQuery)) || 
                 normalizeText(product.stockCode).includes(normalizeText(searchQuery)))
              )
              .map(product => {
                const quantity = parseInt(orderQuantities[product.id] || "0", 10);
                const totalWithVAT = product.price * quantity * (1 + product.vatRate / 100);
                const whitePriceTotal = product.price * quantity * (1 + product.vatRate / 200);
                return (
                  <tr key={product.id}>
                    <td>{product.stockCode}</td>
                    <td>{product.name}</td>
                    <td>{product.unit}</td>
                    <td>{formatCurrency(product.price)}</td>
                    <td>{formatCurrency(product.price * (1 + product.vatRate / 100))}</td>
                    <td>{formatCurrency(product.price * (1 + product.vatRate / 200))}</td>
                    <td>{product.stock}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={product.stock}
                        value={quantity || ""}
                        onChange={(e) => handleQuantityChange(product.id, e.target.value, product.stock)}
                      />
                    </td>
                    <td>{formatCurrency(totalWithVAT)}</td>
                    <td>{formatCurrency(whitePriceTotal)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Firma Adı Girişi */}
      <div style={{ marginTop: "20px", textAlign: "center" }}>
        <label><strong>Firma Adı:</strong> </label>
        <input
          type="text"
          placeholder="Firma Adınızı girin"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          style={{ marginLeft: "10px" }}
        />
      </div>

      {/* Sipariş Toplamları */}
      <div style={{ marginTop: "10px", textAlign: "center" }}>
        <p><strong>KDV Hariç Toplam:</strong> {formatCurrency(totalOrderAmount)}</p>
        <p><strong>KDV Dahil Toplam:</strong> {formatCurrency(totalOrderAmountWithVAT)}</p>
        <p><strong>Beyaz Fiyat Toplam:</strong> {formatCurrency(totalWhitePriceAmount)}</p>
      </div>

      <button onClick={handleOrderSubmit}>Siparişi Gönder</button>
    </div>
  );
}

export default App;
