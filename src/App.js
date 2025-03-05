// App.js
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Supabase bağlantısı
import uploadProductsFromCSV from "./uploadProducts"; // CSV yükleme fonksiyonu
import WhatsAppWidget from "./WhatsAppWidget"; // Yeni bileşeni import et
import OrderConfirmationModal from './OrderConfirmationModal'; // Sipariş onay modalı
import OrderHistory from './OrderHistory'; // Sipariş geçmişi bileşeni
import './FloatingOrderPanel.css'; // Yeni CSS dosyası
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

// Prim hesaplama fonksiyonu
function calculateCommission(orderAmount, stockAge) {
  // Temel prim: Satış tutarının %2'si
  let baseCommission = orderAmount * 0.02;
  
  // Sipariş tutarına göre ek prim
  let orderBonus = 0;
  if (orderAmount >= 200000) {
    orderBonus = orderAmount * 0.02; // 200,000 TL üzeri siparişlerde ek %2
  } else if (orderAmount >= 50000) {
    orderBonus = orderAmount * 0.01; // 50,000 TL üzeri siparişlerde ek %1
  }
  
  // Stok yaşına göre ek prim
  let ageBonus = 0;
  if (stockAge >= 180) {
    ageBonus = orderAmount * 0.015; // 180+ gün bekleyen stoklar için ek %1.5
  } else if (stockAge >= 90) {
    ageBonus = orderAmount * 0.01; // 90+ gün bekleyen stoklar için ek %1
  }
  
  // Toplam prim
  const totalCommission = baseCommission + orderBonus + ageBonus;
  
  return {
    baseCommission,
    orderBonus,
    ageBonus,
    totalCommission
  };
}

function App() {
  const [products, setProducts] = useState([]); 
  const [orderQuantities, setOrderQuantities] = useState({}); 
  const [selectedCategory, setSelectedCategory] = useState("Tümü");
  const [categories, setCategories] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState(""); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Yeni state değişkenleri
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [orderToConfirm, setOrderToConfirm] = useState([]);
  const [showOrderPanel, setShowOrderPanel] = useState(false); // Panel görünürlüğü için
  const [selectedPriceType, setSelectedPriceType] = useState(null); // Fiyat tipi seçimi için, başlangıçta null
  const [commission, setCommission] = useState(null); // Prim bilgileri için

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
          unit: item.unit || "Adet",
          // Yeni alanlar
          entryCost: item.entryCost ? parseFloat(item.entryCost) : 0,
          latestCost: item.latestCost ? parseFloat(item.latestCost) : 0,
          entryDate: item.entryDate || new Date().toISOString().split('T')[0],
          latestCostDate: item.latestCostDate || new Date().toISOString().split('T')[0],
          // Stok yaşını hesapla (gün olarak)
          stockAge: item.entryDate ? 
            Math.floor((new Date() - new Date(item.entryDate)) / (1000 * 60 * 60 * 24)) : 0
        }));
        
        setProducts(productList);
        const categoryList = [...new Set(productList.map(p => p.category))];
        setCategories(["Tümü", ...categoryList]);
      } catch (error) {
        console.error("Ürünleri çekerken hata oluştu:", error);
      }
    }
    fetchProducts();

    // Gerçek zamanlı stok takibi için Supabase kanalı oluştur
    const stockSubscription = supabase
      .channel('product-stock-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
      }, (payload) => {
        // Stok değişikliği olduğunda
        const updatedProduct = payload.new;
        
        // Mevcut ürünleri güncelle
        setProducts(prevProducts => 
          prevProducts.map(product => 
            product.id === updatedProduct.id ? 
              { 
                ...product, 
                stock: updatedProduct.stock,
                // Güncel maliyet ve tarih bilgilerini de güncelle
                latestCost: updatedProduct.latestCost,
                latestCostDate: updatedProduct.latestCostDate
              } : 
              product
          )
        );
        
        // Eğer sipariş miktarı stoktan fazlaysa, miktarı güncelle
        if (orderQuantities[updatedProduct.id] > updatedProduct.stock) {
          setOrderQuantities(prev => ({ 
            ...prev, 
            [updatedProduct.id]: updatedProduct.stock 
          }));
          
          // Stok değişikliği bildirimi göster
          if (updatedProduct.stock <= 0) {
            alert(`"${updatedProduct.name}" ürünü tükendi. Sepetiniz güncellendi.`);
          } else {
            alert(`"${updatedProduct.name}" ürününün stok miktarı değişti. Yeni stok: ${updatedProduct.stock}. Sepetiniz güncellendi.`);
          }
        }
      })
      .subscribe();

    // Component unmount olduğunda abonelikten çık
    return () => {
      stockSubscription.unsubscribe();
    };
  }, [orderQuantities]); // orderQuantities bağımlılığını ekledik

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
    
    if (!customerPhone.trim()) {
      alert("Lütfen telefon numaranızı girin!");
      return;
    }
    
    // Fiyat tipi kontrolü ekliyoruz
    if (!selectedPriceType) {
      alert("Lütfen fiyat türü seçin!");
      return;
    }

    const itemsToOrder = [];
    let totalOrderValue = 0;
    let averageStockAge = 0;
    let totalOrderedItems = 0;
    
    for (const product of products) {
      const quantity = parseInt(orderQuantities[product.id] || "0", 10);
      if (quantity > 0 && quantity <= product.stock) {
        // Seçilen fiyat tipine göre tutar hesaplama
        const priceWithVAT = product.price * (1 + product.vatRate / 100);
        const whitePrice = product.price * (1 + product.vatRate / 200);
        const selectedPrice = selectedPriceType === "kdvDahil" ? priceWithVAT : whitePrice;
        
        // Toplam sipariş değerine ekle
        const itemTotal = selectedPrice * quantity;
        totalOrderValue += itemTotal;
        
        // Stok yaşı toplamını güncelle
        averageStockAge += product.stockAge * quantity;
        totalOrderedItems += quantity;
        
        itemsToOrder.push({
          id: product.id,
          stockCode: product.stockCode,
          name: product.name,
          quantity: quantity,
          price: product.price,
          unit: product.unit,
          vatRate: product.vatRate,
          totalPrice: product.price * quantity * (1 + product.vatRate / 100),
          totalWhitePrice: whitePrice * quantity,
          selectedPriceType: selectedPriceType,
          selectedPrice: selectedPrice,
          totalSelectedPrice: selectedPrice * quantity,
          stockAge: product.stockAge
        });
      }
    }

    if (itemsToOrder.length === 0) {
      alert("Sipariş için geçerli miktar girilmedi!");
      return;
    }
    
    // Ortalama stok yaşını hesapla
    averageStockAge = totalOrderedItems > 0 ? Math.round(averageStockAge / totalOrderedItems) : 0;
    
    // Prim hesapla
    const calculatedCommission = calculateCommission(totalOrderValue, averageStockAge);
    setCommission(calculatedCommission);

    setOrderToConfirm(itemsToOrder);
    setShowConfirmationModal(true);
  };

  // PDF oluşturma fonksiyonu - düzeltilmiş hali
  const generateOrderPDF = () => {
    try {
      // PDF oluştur
      const doc = new jsPDF();
      
      // PDF Başlığı
      doc.setFontSize(16); // Daha küçük başlık
      doc.text("Sipariş Detayları", 14, 22);
      
      // Firma Bilgileri
      doc.setFontSize(10); // Daha küçük yazı
      doc.text(`Firma: ${customerName}`, 14, 32);
      doc.text(`Telefon: ${customerPhone}`, 14, 38); 
      doc.text(`Sipariş Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 44);
      doc.text(`Fiyat Türü: ${selectedPriceType === "kdvDahil" ? "KDV Dahil Fiyat" : "Beyaz Fiyat"}`, 14, 50);
      
      // Sipariş Tablosu
      const tableColumn = ["Stok Kodu", "Ürün", "Miktar", "Birim", "Birim Fiyat", "Toplam"];
      const tableRows = [];

      orderToConfirm.forEach(item => {
        const displayPrice = selectedPriceType === "kdvDahil" ? 
          item.price * (1 + item.vatRate / 100) :
          item.price * (1 + item.vatRate / 200);

        const totalDisplayPrice = displayPrice * item.quantity;

        const itemData = [
          item.stockCode,
          item.name,
          item.quantity,
          item.unit,
          formatCurrency(displayPrice),
          formatCurrency(totalDisplayPrice)
        ];
        tableRows.push(itemData);
      });

      // autoTable kütüphanesi kullanımı
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 }, // Küçük yazı
        headStyles: { fillColor: [60, 60, 60] }
      });
      
      // Toplam Tutar Bilgileri - Daha sağa yaslı ve küçük
      const finalY = doc.lastAutoTable.finalY + 10;
      
      // Seçilen fiyat tipine göre toplam tutar gösterme
      if (selectedPriceType === "kdvDahil") {
        doc.text(`KDV Dahil Toplam: ${formatCurrency(totalOrderAmountWithVAT)}`, 130, finalY);
      } else {
        doc.text(`Beyaz Fiyat Toplam: ${formatCurrency(totalWhitePriceAmount)}`, 130, finalY);
      }
      
      // Admin ise prim bilgilerini ekle
      if (isAdmin && commission) {
        doc.text(`Satıcı Primi: ${formatCurrency(commission.totalCommission)}`, 130, finalY + 7);
        doc.text(`- Temel Prim (%2): ${formatCurrency(commission.baseCommission)}`, 130, finalY + 14);
        if (commission.orderBonus > 0) {
          doc.text(`- Sipariş Tutarı Primi: ${formatCurrency(commission.orderBonus)}`, 130, finalY + 21);
        }
        if (commission.ageBonus > 0) {
          doc.text(`- Stok Yaşı Primi: ${formatCurrency(commission.ageBonus)}`, 130, finalY + 28);
        }
      }
      
      // PDF'i kaydet
      doc.save(`${customerName}_siparis_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      alert("PDF oluşturulurken bir hata oluştu. Sipariş kaydedildi fakat PDF indirilemedi.");
    }
  };

  // Sipariş onaylandığında çalışacak fonksiyon - gerçek zamanlı stok kontrolü ile
  const confirmAndSubmitOrder = async () => {
    setShowConfirmationModal(false);
    
    try {
      // Sipariş edilecek ürünlerin listesini hazırlayalım
      const productsToOrder = [];
      for (const product of products) {
        const quantity = parseInt(orderQuantities[product.id] || "0", 10);
        if (quantity > 0) {
          productsToOrder.push({
            id: product.id,
            requestedQuantity: quantity
          });
        }
      }
      
      // Stokta olmayan ürünleri kontrol edeceğiz
      const stockErrors = [];
      
      // Siparişe eklenecek ürünlerin güncel stok durumlarını çekelim
      for (const productToOrder of productsToOrder) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, stock')
          .eq('id', productToOrder.id)
          .single();
        
        if (error) {
          console.error("Stok kontrolü sırasında hata:", error);
          stockErrors.push(`Ürün durumu kontrol edilemedi: ${error.message}`);
          continue;
        }
        
        if (!data) {
          stockErrors.push(`Ürün bulunamadı (ID: ${productToOrder.id})`);
          continue;
        }
        
        // Güncel stok kontrolü
        if (productToOrder.requestedQuantity > data.stock) {
          stockErrors.push(`"${data.name}" ürününden istediğiniz miktarda stok kalmadı. Güncel stok: ${data.stock}`);
          
          // State'i güncelle
          setProducts(prevProducts => 
            prevProducts.map(p => 
              p.id === data.id ? { ...p, stock: data.stock } : p
            )
          );
        }
      }
      
      // Stok hatası varsa göster ve işlemi durdur
      if (stockErrors.length > 0) {
        alert(`Siparişiniz işlenemiyor:\n\n${stockErrors.join('\n\n')}\n\nLütfen sepetinizi güncelleyin.`);
        return;
      }
      
      // Stok kontrolü geçtiyse işleme devam et...
      
      const ordersToSend = [];
      const updatedProducts = [...products];

      for (const product of products) {
        const quantity = parseInt(orderQuantities[product.id] || "0", 10);
        if (quantity > 0) {
          ordersToSend.push({
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            stockCode: product.stockCode,
            productId: product.id,
            productName: product.name,
            quantity: quantity,
            price: product.price,
            vatRate: product.vatRate,
            whitePrice: product.price * (1 + (product.vatRate / 200)),
            totalPrice: product.price * quantity * (1 + product.vatRate / 100),
            unit: product.unit,
            selectedPriceType: selectedPriceType,
            stockAge: product.stockAge,
            // Prim bilgilerini de ekle
            baseCommission: commission ? commission.baseCommission / ordersToSend.length : 0,
            orderBonus: commission ? commission.orderBonus / ordersToSend.length : 0,
            ageBonus: commission ? commission.ageBonus / ordersToSend.length : 0,
            totalCommission: commission ? commission.totalCommission / ordersToSend.length : 0,
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

      // Stokları azalt
      for (const product of products) {
        const quantity = parseInt(orderQuantities[product.id] || "0", 10);
        if (quantity > 0) {
          const { error: updateError } = await supabase
            .from('products')
            .update({ stock: updatedProducts.find(p => p.id === product.id).stock })
            .eq('id', product.id);
            
          if (updateError) {
            console.error("Stok güncelleme hatası:", updateError);
          }
        }
      }

      setProducts(updatedProducts);
      setOrderQuantities({});
      
      // PDF oluştur
      generateOrderPDF();
      
      setCustomerName(""); 
      setCustomerPhone(""); 
      setSelectedPriceType(null);
      setCommission(null);
      setShowOrderPanel(false);
      alert("Sipariş başarıyla gönderildi!");
    } catch (error) {
      console.error("Sipariş işleme hatası:", error);
      alert("Sipariş işlenirken bir hata oluştu. Lütfen tekrar deneyin.");
    }
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
  
  // Seçilen fiyat tipine göre toplam tutar
  const totalSelectedAmount = selectedPriceType === "kdvDahil" ? 
    totalOrderAmountWithVAT : 
    (selectedPriceType === "beyaz" ? totalWhitePriceAmount : 0);

  // Filtrelenmiş ürünleri hesapla
  const filteredProducts = products
    .filter(product => 
      (selectedCategory === "Tümü" || product.category === selectedCategory) &&
      (normalizeText(product.name).includes(normalizeText(searchQuery)) || 
       normalizeText(product.stockCode).includes(normalizeText(searchQuery)))
    );

  // Toplam sipariş edilmiş ürün sayısı
  const totalOrderedItems = Object.values(orderQuantities).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

  return (
    <div style={{ padding: "10px", paddingBottom: "80px" }}> {/* Alt panel için ekstra padding */}
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
      
      {/* Sipariş Geçmişi (Sadece Adminler İçin) */}
      {isAdmin && (
        <div style={{ marginTop: "30px" }}>
          <OrderHistory formatCurrency={formatCurrency} />
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
              {isAdmin && <th>Stok Yaşı</th>} {/* Admin için stok yaşı gösterimi */}
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
                  {/* Admin için stok yaşı gösterimi */}
                  {isAdmin && <td>{product.stockAge} gün</td>}
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

      {/* Sabit Sipariş Özeti Paneli */}
      {totalOrderedItems > 0 && (
        <div className="floating-order-panel">
          <div className="panel-summary">
            <div className="panel-items-count">
              <span>{totalOrderedItems} ürün</span>
            </div>
            <div className="panel-total">
              <span>Toplam:</span>
              <strong>
                {selectedPriceType ? 
                  formatCurrency(totalSelectedAmount) : 
                  "Lütfen fiyat türü seçin"}
              </strong>
            </div>
            <button 
              className="panel-complete-button"
              onClick={() => setShowOrderPanel(!showOrderPanel)}
            >
              {showOrderPanel ? "Paneli Gizle" : "Siparişi Tamamla"}
            </button>
          </div>

          {showOrderPanel && (
            <div className="panel-details">
              {/* Firma Adı ve Telefon Girişi */}
              <div className="panel-inputs">
                <div className="input-group">
                  <label><strong>Firma Adı:</strong> <span className="required-mark">*</span></label>
                  <input
                    type="text"
                    placeholder="Firma Adınızı girin"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                
                <div className="input-group">
                  <label><strong>Telefon Numaranız:</strong> <span className="required-mark">*</span></label>
                  <input
                    type="tel"
                    placeholder="530 178 35 70"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Fiyat Tipi Seçimi */}
              <div className="price-type-selector">
                <div className="selector-label">
                  <strong>Fiyat Türü Seçimi:</strong> <span className="required-mark">*</span>
                </div>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="priceType"
                      value="kdvDahil"
                      checked={selectedPriceType === "kdvDahil"}
                      onChange={(e) => setSelectedPriceType(e.target.value)}
                      required
                    />
                    KDV Dahil Fiyat ({formatCurrency(totalOrderAmountWithVAT)})
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="priceType"
                      value="beyaz"
                      checked={selectedPriceType === "beyaz"}
                      onChange={(e) => setSelectedPriceType(e.target.value)}
                      required
                    />
                    Beyaz Fiyat ({formatCurrency(totalWhitePriceAmount)})
                  </label>
                </div>
                {!selectedPriceType && (
                  <div className="price-type-warning">Lütfen bir fiyat türü seçin</div>
                )}
              </div>

              {/* Sipariş Gönder Butonu */}
              <button 
                className="send-order-button" 
                onClick={showOrderConfirmation}
              >
                Siparişi Onayla ve Gönder
              </button>
            </div>
          )}
        </div>
      )}

      <WhatsAppWidget />

      {/* Sipariş onay modalı */}
      <OrderConfirmationModal 
        show={showConfirmationModal}
        onClose={() => setShowConfirmationModal(false)}
        onConfirm={confirmAndSubmitOrder}
        orderItems={orderToConfirm}
        customerName={customerName}
        customerPhone={customerPhone}
        totalOrderAmount={totalOrderAmount}
        totalOrderAmountWithVAT={totalOrderAmountWithVAT}
        totalWhitePriceAmount={totalWhitePriceAmount}
        selectedPriceType={selectedPriceType}
        formatCurrency={formatCurrency}
        commission={commission}
        isAdmin={isAdmin}
      />
    </div>
  );
}

export default App;