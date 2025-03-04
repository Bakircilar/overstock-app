// App.js
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Supabase bağlantısı
import uploadProductsFromCSV from "./uploadProducts"; // CSV yükleme fonksiyonu
import WhatsAppWidget from "./WhatsAppWidget"; // Yeni bileşeni import et
import OrderConfirmationModal from './OrderConfirmationModal'; // Sipariş onay modalı
// PDF kütüphanelerini doğru şekilde import ediyoruz
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './App.css';  // Responsive stiller için CSS dosyasını ekledik

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
  // Yeni state değişkenleri
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [orderToConfirm, setOrderToConfirm] = useState([]);

  // Stok için düşük seviye eşiği
  const LOW_STOCK_THRESHOLD = 5;

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

  const handleQuantityChange = (productId, value, maxStock) => {
    let quantity = parseInt(value, 10);
    if (isNaN(quantity) || quantity < 0) quantity = 0;
    if (quantity > maxStock) quantity = maxStock;
    setOrderQuantities(prev => ({ ...prev, [productId]: quantity }));
  };

  // Sipariş onay modalını gösterme
  const showOrderConfirmation = () => {
    if (!customerName.trim()) {
      alert("Lütfen firma adınızı girin!");
      return;
    }

    const itemsToOrder = [];
    
    for (const product of products) {
      const quantity = parseInt(orderQuantities[product.id] || "0", 10);
      if (quantity > 0 && quantity <= product.stock) {
        itemsToOrder.push({
          id: product.id,
          stockCode: product.stockCode,
          name: product.name,
          quantity: quantity,
          price: product.price,
          unit: product.unit,
          vatRate: product.vatRate,
          totalPrice: product.price * quantity * (1 + product.vatRate / 100)
        });
      }
    }

    if (itemsToOrder.length === 0) {
      alert("Sipariş için geçerli miktar girilmedi!");
      return;
    }

    setOrderToConfirm(itemsToOrder);
    setShowConfirmationModal(true);
  };

  // PDF oluşturma fonksiyonu - düzeltilmiş hali
  const generateOrderPDF = () => {
    try {
      // PDF oluştur
      const doc = new jsPDF();
      
      // PDF Başlığı
      doc.setFontSize(20);
      doc.text("Sipariş Detayları", 14, 22);
      
      // Firma Bilgileri
      doc.setFontSize(12);
      doc.text(`Firma: ${customerName}`, 14, 35);
      doc.text(`Sipariş Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 42);
      
      // Sipariş Tablosu
      const tableColumn = ["Stok Kodu", "Ürün", "Miktar", "Birim", "Birim Fiyat", "Toplam"];
      const tableRows = [];

      orderToConfirm.forEach(item => {
        const itemData = [
          item.stockCode,
          item.name,
          item.quantity,
          item.unit,
          formatCurrency(item.price),
          formatCurrency(item.totalPrice)
        ];
        tableRows.push(itemData);
      });

      // autoTable kütüphanesi kullanımı
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 50,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] }
      });
      
      // Toplam Tutar Bilgileri
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.text(`KDV Hariç Toplam: ${formatCurrency(totalOrderAmount)}`, 120, finalY);
      doc.text(`KDV Dahil Toplam: ${formatCurrency(totalOrderAmountWithVAT)}`, 120, finalY + 7);
      doc.text(`Beyaz Fiyat Toplam: ${formatCurrency(totalWhitePriceAmount)}`, 120, finalY + 14);
      
      // PDF'i kaydet
      doc.save(`${customerName}_siparis_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      alert("PDF oluşturulurken bir hata oluştu. Sipariş kaydedildi fakat PDF indirilemedi.");
    }
  };

  // Sipariş onaylandığında çalışacak fonksiyon
  const confirmAndSubmitOrder = async () => {
    setShowConfirmationModal(false);
    
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

    const { error } = await supabase
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
    
    // PDF oluştur - try/catch içinde çağrılıyor
    generateOrderPDF();
    
    setCustomerName(""); 
    alert("Sipariş başarıyla gönderildi!");
  };

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

  // Filtrelenmiş ürünleri hesapla
  const filteredProducts = products
    .filter(product => 
      (selectedCategory === "Tümü" || product.category === selectedCategory) &&
      (normalizeText(product.name).includes(normalizeText(searchQuery)) || 
       normalizeText(product.stockCode).includes(normalizeText(searchQuery)))
    );

  return (
    <div style={{ padding: "10px" }}>
      {/* Header Bölümü: Üstte sol kısımda logonuz ve site başlığı */}
      <header style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
        <img 
          src="/logo.png" 
          alt="Site Logosu" 
          style={{ height: "50px", marginRight: "10px" }}
        />
        <h1>Overstock Sipariş Sistemi</h1>
      </header>
      
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

      {/* Süzülen ürün sayısını gösterme */}
      <div style={{ margin: "10px 0", textAlign: "left" }}>
        <p>{filteredProducts.length} ürün gösteriliyor</p>
      </div>

      <div className="table-container" style={{ overflowX: "auto" }}>
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
            {filteredProducts.map(product => {
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
                  {/* Stok hücresi için renk kodlaması */}
                  <td style={{ 
                    backgroundColor: product.stock <= LOW_STOCK_THRESHOLD ? '#ffcccc' : 'transparent',
                    color: product.stock <= LOW_STOCK_THRESHOLD ? '#cc0000' : 'inherit',
                    fontWeight: product.stock <= LOW_STOCK_THRESHOLD ? 'bold' : 'normal'
                  }}>
                    {product.stock}
                  </td>
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

      {/* Sipariş gönder butonunun fonksiyonunu değiştirdik */}
      <button onClick={showOrderConfirmation}>Siparişi Gönder</button>
      <WhatsAppWidget />

      {/* Sipariş onay modalı */}
      <OrderConfirmationModal 
        show={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        onConfirm={confirmAndSubmitOrder}
        orderItems={orderToConfirm}
        customerName={customerName}
        totalOrderAmount={totalOrderAmount}
        totalOrderAmountWithVAT={totalOrderAmountWithVAT}
        totalWhitePriceAmount={totalWhitePriceAmount}
        formatCurrency={formatCurrency}
      />
    </div>
  );
}

export default App;