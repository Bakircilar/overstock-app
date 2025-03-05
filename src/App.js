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
import './App.css';  // Sticky thead ve diğer responsive stiller bu dosyada

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
  
  // Stok yaşı prim
  let ageBonus = 0;
  if (stockAge >= 180) {
    ageBonus = orderAmount * 0.015; // 180+ gün bekleyen stoklar için ek %1.5
  } else if (stockAge >= 90) {
    ageBonus = orderAmount * 0.01;  // 90+ gün bekleyen stoklar için ek %1
  }
  
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
  const [showOrderPanel, setShowOrderPanel] = useState(false); // Panel görünürlüğü
  const [selectedPriceType, setSelectedPriceType] = useState(null); // Fiyat tipi
  const [commission, setCommission] = useState(null); // Prim bilgileri

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
          entryCost: item.entryCost ? parseFloat(item.entryCost) : 0,
          latestCost: item.latestCost ? parseFloat(item.latestCost) : 0,
          entryDate: item.entryDate || new Date().toISOString().split('T')[0],
          latestCostDate: item.latestCostDate || new Date().toISOString().split('T')[0],
          // Stok yaşı (gün)
          stockAge: item.entryDate 
            ? Math.floor((new Date() - new Date(item.entryDate)) / (1000 * 60 * 60 * 24))
            : 0
        }));
        
        setProducts(productList);
        const categoryList = [...new Set(productList.map(p => p.category))];
        setCategories(["Tümü", ...categoryList]);
      } catch (error) {
        console.error("Ürünleri çekerken hata oluştu:", error);
      }
    }
    fetchProducts();

    // Gerçek zamanlı stok takibi
    const stockSubscription = supabase
      .channel('product-stock-changes')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'products',
      }, (payload) => {
        const updatedProduct = payload.new;
        
        // Mevcut ürünleri güncelle
        setProducts(prevProducts => 
          prevProducts.map(product => 
            product.id === updatedProduct.id 
              ? { 
                  ...product, 
                  stock: updatedProduct.stock,
                  latestCost: updatedProduct.latestCost,
                  latestCostDate: updatedProduct.latestCostDate
                }
              : product
          )
        );
        
        // Eğer sipariş miktarı stoktan fazlaysa, miktarı güncelle
        if (orderQuantities[updatedProduct.id] > updatedProduct.stock) {
          setOrderQuantities(prev => ({ 
            ...prev, 
            [updatedProduct.id]: updatedProduct.stock 
          }));
          
          if (updatedProduct.stock <= 0) {
            alert(`"${updatedProduct.name}" ürünü tükendi. Sepetiniz güncellendi.`);
          } else {
            alert(`"${updatedProduct.name}" ürününün stok miktarı değişti. Yeni stok: ${updatedProduct.stock}.`);
          }
        }
      })
      .subscribe();

    return () => {
      stockSubscription.unsubscribe();
    };
  }, [orderQuantities]);

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
    if (!selectedPriceType) {
      alert("Lütfen fiyat türü seçin!");
      return;
    }

    const itemsToOrder = [];
    let totalCommissionValue = 0; // Prim hesaplaması için kullanılacak değer
    let averageStockAge = 0;
    let totalOrderedItems = 0;
    
    for (const product of products) {
      const quantity = parseInt(orderQuantities[product.id] || "0", 10);
      if (quantity > 0 && quantity <= product.stock) {
        const priceWithVAT = product.price * (1 + product.vatRate / 100);
        const whitePrice = product.price * (1 + product.vatRate / 200);
        const selectedPrice = selectedPriceType === "kdvDahil" ? priceWithVAT : whitePrice;
        
        const itemTotal = selectedPrice * quantity;
        
        // Prim hesaplaması için: KDV dahil seçildiğinde KDV hariç fiyat, beyaz fiyat seçildiğinde beyaz fiyat
        const commissionPrice = selectedPriceType === "kdvDahil" ? product.price : whitePrice;
        totalCommissionValue += commissionPrice * quantity;
        
        // Stok yaşını ağırlıklı ortalama için topla
        averageStockAge += product.stockAge * quantity;
        totalOrderedItems += quantity;
        
        itemsToOrder.push({
          id: product.id,
          stockCode: product.stockCode,
          name: product.name,
          quantity,
          price: product.price,
          unit: product.unit,
          vatRate: product.vatRate,
          totalPrice: product.price * quantity * (1 + product.vatRate / 100),
          totalWhitePrice: whitePrice * quantity,
          selectedPriceType,
          selectedPrice,
          totalSelectedPrice: itemTotal,
          stockAge: product.stockAge,
          // Her ürün için prim bilgisini de ekleyelim
          commissionPrice
        });
      }
    }

    if (itemsToOrder.length === 0) {
      alert("Sipariş için geçerli miktar girilmedi!");
      return;
    }
    
    averageStockAge = totalOrderedItems > 0 
      ? Math.round(averageStockAge / totalOrderedItems) 
      : 0;
    
    const calculatedCommission = calculateCommission(totalCommissionValue, averageStockAge);
    // Toplam tutarı commission nesnesine ekleyelim ki sonradan kullanabilelim
    calculatedCommission.orderAmount = totalCommissionValue;
    setCommission(calculatedCommission);

    setOrderToConfirm(itemsToOrder);
    setShowConfirmationModal(true);
  };

  // PDF oluşturma fonksiyonu
  const generateOrderPDF = () => {
    try {
      const doc = new jsPDF();
      
      doc.setFontSize(16);
      doc.text("Sipariş Detayları", 14, 22);
      
      doc.setFontSize(10);
      doc.text(`Firma: ${customerName}`, 14, 32);
      doc.text(`Telefon: ${customerPhone}`, 14, 38);
      doc.text(`Sipariş Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 44);
      doc.text(
        `Fiyat Türü: ${selectedPriceType === "kdvDahil" ? "KDV Dahil Fiyat" : "Beyaz Fiyat"}`,
        14,
        50
      );
      
      const tableColumn = ["Stok Kodu", "Ürün", "Miktar", "Birim", "Birim Fiyat", "Toplam"];
      const tableRows = [];

      orderToConfirm.forEach(item => {
        const displayPrice = item.selectedPriceType === "kdvDahil"
          ? item.price * (1 + item.vatRate / 100)
          : item.price * (1 + item.vatRate / 200);
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

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [60, 60, 60] }
      });
      
      const finalY = doc.lastAutoTable.finalY + 10;
      
      if (selectedPriceType === "kdvDahil") {
        doc.text(`KDV Dahil Toplam: ${formatCurrency(totalOrderAmountWithVAT)}`, 130, finalY);
      } else {
        doc.text(`Beyaz Fiyat Toplam: ${formatCurrency(totalWhitePriceAmount)}`, 130, finalY);
      }
      
      // Admin ise prim bilgileri ekle
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
      
      doc.save(`${customerName}_siparis_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      alert("PDF oluşturulurken bir hata oluştu.");
    }
  };

  // Sipariş onaylandığında çalışacak fonksiyon
  const confirmAndSubmitOrder = async () => {
    setShowConfirmationModal(false);
    
    try {
      // Güncel stok kontrolü
      const productsToOrder = [];
      for (const product of products) {
        const quantity = parseInt(orderQuantities[product.id] || "0", 10);
        if (quantity > 0) {
          productsToOrder.push({ id: product.id, requestedQuantity: quantity });
        }
      }
      
      const stockErrors = [];
      for (const productToOrder of productsToOrder) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, stock')
          .eq('id', productToOrder.id)
          .single();
        
        if (error) {
          console.error("Stok kontrolü hatası:", error);
          stockErrors.push(`Ürün kontrol edilemedi: ${error.message}`);
          continue;
        }
        
        if (!data) {
          stockErrors.push(`Ürün bulunamadı (ID: ${productToOrder.id})`);
          continue;
        }
        
        if (productToOrder.requestedQuantity > data.stock) {
          stockErrors.push(
            `"${data.name}" ürününden istediğiniz miktarda stok kalmadı. Güncel stok: ${data.stock}`
          );
        }
      }
      
      if (stockErrors.length > 0) {
        alert(`Siparişiniz işlenemiyor:\n\n${stockErrors.join('\n\n')}\n\nLütfen sepetinizi güncelleyin.`);
        return;
      }
      
      // Stok uygunsa sipariş oluştur
      const ordersToSend = [];
      const updatedProducts = [...products];

      // Önce sipariş oluşturulacak ürünleri sayalım ve loglama yapalım
      const orderableProductCount = products.filter(product => 
        parseInt(orderQuantities[product.id] || "0", 10) > 0
      ).length;
      // ESLint hatasını önlemek için değişkeni kullanıyoruz
      if (process.env.NODE_ENV === 'development') {
        console.log(`Sipariş edilen toplam ürün çeşidi: ${orderableProductCount}`);
      }
      
      // Toplam komisyon değerini hesapla ve loglama yapalım
      const totalCommissionAmount = commission ? commission.totalCommission : 0;
      // ESLint hatasını önlemek için değişkeni kullanıyoruz
      if (process.env.NODE_ENV === 'development') {
        console.log(`Toplam prim tutarı: ${formatCurrency(totalCommissionAmount)}`);
      }
      
      for (const product of products) {
        const quantity = parseInt(orderQuantities[product.id] || "0", 10);
        if (quantity > 0) {
          // Sipariş edilen miktara ve ürün fiyatına göre bu ürüne düşen prim
          const commissionPrice = selectedPriceType === "kdvDahil" ? product.price : product.price * (1 + (product.vatRate / 200));
          const productTotal = commissionPrice * quantity;
          const productRatio = commission ? (productTotal / commission.orderAmount) : 0;
          
          ordersToSend.push({
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            stockCode: product.stockCode,
            productId: product.id,
            productName: product.name,
            quantity,
            price: product.price,
            vatRate: product.vatRate,
            whitePrice: product.price * (1 + (product.vatRate / 200)),
            totalPrice: product.price * quantity * (1 + product.vatRate / 100),
            unit: product.unit,
            selectedPriceType,
            stockAge: product.stockAge,
            // Her ürün için siparişteki oranına göre prim hesaplama
            baseCommission: commission ? commission.baseCommission * productRatio : 0,
            orderBonus: commission ? commission.orderBonus * productRatio : 0,
            ageBonus: commission ? commission.ageBonus * productRatio : 0,
            totalCommission: commission ? commission.totalCommission * productRatio : 0,
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
        console.error("Hata detayları:", error.details);
        console.error("Hata mesajı:", error.message);
        alert("Sipariş eklenirken hata oluştu!");
        return;
      }

      // Stok güncelle
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

  // Toplamlar
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
  
  const totalSelectedAmount = selectedPriceType === "kdvDahil" 
    ? totalOrderAmountWithVAT 
    : (selectedPriceType === "beyaz" ? totalWhitePriceAmount : 0);

  // Filtrelenmiş ürünler
  const filteredProducts = products.filter(product => 
    (selectedCategory === "Tümü" || product.category === selectedCategory) &&
    (normalizeText(product.name).includes(normalizeText(searchQuery)) ||
     normalizeText(product.stockCode).includes(normalizeText(searchQuery)))
  );

  // Toplam sipariş edilmiş ürün sayısı
  const totalOrderedItems = Object.values(orderQuantities)
    .reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

  return (
    <div style={{ padding: "10px", paddingBottom: "80px" }}>
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
          <input 
            type="file" 
            accept=".csv" 
            onChange={(e) => uploadProductsFromCSV(e.target.files[0])} 
          />
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

      <div style={{ margin: "10px 0", textAlign: "left" }}>
        <p>{filteredProducts.length} ürün gösteriliyor</p>
      </div>

      {/* Sticky thead için sadece className="table-container" kullandık, inline style yok */}
      <div className="table-container">
        <table border="1">
          <thead>
            <tr>
              <th>Stok Kodu</th>
              <th>Ürün</th>
              <th>Birim</th>
              <th>Fiyat (KDV Hariç)</th>
              <th>Fiyat (KDV Dahil)</th>
              <th>Beyaz Fiyat</th>
              <th>Stok</th>
              {isAdmin && <th>Stok Yaşı</th>}
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
                  <td 
                    style={{ 
                      backgroundColor: product.stock <= LOW_STOCK_THRESHOLD ? '#ffcccc' : 'transparent',
                      color: product.stock <= LOW_STOCK_THRESHOLD ? '#cc0000' : 'inherit',
                      fontWeight: product.stock <= LOW_STOCK_THRESHOLD ? 'bold' : 'normal'
                    }}
                  >
                    {product.stock}
                  </td>
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
                {selectedPriceType 
                  ? formatCurrency(totalSelectedAmount) 
                  : "Lütfen fiyat türü seçin"}
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
                  <label>
                    <strong>Firma Adı:</strong> 
                    <span className="required-mark">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Firma Adınızı girin"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                </div>
                
                <div className="input-group">
                  <label>
                    <strong>Telefon Numaranız:</strong> 
                    <span className="required-mark">*</span>
                  </label>
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
                  <strong>Fiyat Türü Seçimi:</strong> 
                  <span className="required-mark">*</span>
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