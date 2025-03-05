// OrderHistory.js
import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import './OrderHistory.css';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

function OrderHistory({ formatCurrency }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloadedOrders, setDownloadedOrders] = useState({});

  // LocalStorage'dan indirilen siparişleri yükleme
  useEffect(() => {
    const savedDownloads = localStorage.getItem('downloadedOrders');
    if (savedDownloads) {
      setDownloadedOrders(JSON.parse(savedDownloads));
    }
  }, []);

  // Siparişleri çekme
  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .order('timestamp', { ascending: false });

        if (error) {
          console.error("Siparişleri çekerken hata oluştu:", error);
          return;
        }

        // Siparişleri gruplandırma
        const groupedOrders = groupOrdersByCustomerAndDate(data);
        setOrders(groupedOrders);
      } catch (error) {
        console.error("Siparişleri çekerken hata oluştu:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, []);

  // Excel dışa aktarma fonksiyonu
  const exportOrdersToExcel = (orders) => {
    try {
      // Tüm siparişleri düzleştirip Excel formatına uygun hale getiriyoruz
      const flattenedOrders = [];
      
      orders.forEach(order => {
        order.items.forEach(item => {
          flattenedOrders.push({
            'Firma Adı': order.customerName,
            'Telefon': order.customerPhone || 'Belirtilmemiş',
            'Sipariş Tarihi': order.date,
            'Stok Kodu': item.stockCode,
            'Ürün': item.productName,
            'Miktar': item.quantity,
            'Birim': item.unit,
            'Birim Fiyat (KDV Hariç)': item.price,
            'KDV Oranı': `%${item.vatRate}`,
            'Fiyat Türü': order.selectedPriceType === "beyaz" ? "Beyaz Fiyat" : "KDV Dahil",
            'Birim Fiyat': order.selectedPriceType === "beyaz" ? 
              item.whitePrice : 
              (item.price * (1 + item.vatRate / 100)),
            'Toplam Tutar': order.selectedPriceType === "beyaz" ? 
              (item.whitePrice * item.quantity) : 
              item.totalPrice
          });
        });
      });
      
      // XLSX WorkSheet oluşturma
      const worksheet = XLSX.utils.json_to_sheet(flattenedOrders);
      
      // Sütun genişliklerini ayarlama
      const maxWidth = 20;
      const colWidths = {};
      Object.keys(flattenedOrders[0] || {}).forEach(key => {
        colWidths[key] = Math.min(maxWidth, key.length + 2);
      });
      
      worksheet['!cols'] = Object.keys(flattenedOrders[0] || {}).map(key => ({
        wch: colWidths[key]
      }));
      
      // WorkBook oluşturma
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Siparişler");
      
      // Dosyayı indirme
      const currentDate = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Siparisler_${currentDate}.xlsx`);
      
      return true;
    } catch (error) {
      console.error("Excel dosyası oluşturulurken hata:", error);
      alert("Excel dosyası oluşturulurken bir hata oluştu.");
      return false;
    }
  };

  // Siparişleri müşteri ve tarih bazında gruplandırma
  const groupOrdersByCustomerAndDate = (ordersData) => {
    const orderGroups = {};

    ordersData.forEach(order => {
      // ISO string'i Date objesi kullanarak yerel saat dilimine göre formatla
      const orderDate = new Date(order.timestamp).toLocaleDateString('tr-TR');
      const key = `${order.customerName}_${orderDate}`;
      
      if (!orderGroups[key]) {
        orderGroups[key] = {
          id: key,
          customerName: order.customerName,
          customerPhone: order.customerPhone || "Belirtilmemiş",
          selectedPriceType: order.selectedPriceType || "kdvDahil", // Varsayılan değer
          date: orderDate,
          timestamp: order.timestamp,
          items: [],
          totalAmount: 0,
          totalAmountWithVAT: 0,
          totalWhitePrice: 0
        };
      }
      
      orderGroups[key].items.push(order);
      orderGroups[key].totalAmount += order.price * order.quantity;
      orderGroups[key].totalAmountWithVAT += order.totalPrice;
      orderGroups[key].totalWhitePrice += order.whitePrice * order.quantity;
    });

    // Objeyi diziye çevirip en yeni siparişler üstte olacak şekilde sırala
    return Object.values(orderGroups).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
  };

  // PDF oluşturma fonksiyonu
  const generateOrderPDF = (order) => {
    try {
      const doc = new jsPDF();
      
      // PDF Başlığı
      doc.setFontSize(16); // Daha küçük başlık
      doc.text("Sipariş Detayları", 14, 22);
      
      // Firma ve Tarih Bilgileri
      doc.setFontSize(10); // Daha küçük yazı
      doc.text(`Firma: ${order.customerName}`, 14, 32);
      doc.text(`Telefon: ${order.customerPhone}`, 14, 38);
      doc.text(`Sipariş Tarihi: ${order.date}`, 14, 44);
      doc.text(`Fiyat Türü: ${order.selectedPriceType === "beyaz" ? "Beyaz Fiyat" : "KDV Dahil Fiyat"}`, 14, 50);
      
      // Sipariş Tablosu
      const tableColumn = ["Stok Kodu", "Ürün", "Miktar", "Birim", "Birim Fiyat", "KDV", "Toplam"];
      const tableRows = [];

      order.items.forEach(item => {
        // Seçilen fiyat tipine göre gösterilecek fiyat
        const displayPrice = order.selectedPriceType === "beyaz" ? 
          item.whitePrice : (item.price * (1 + item.vatRate / 100));
        
        const totalDisplayPrice = order.selectedPriceType === "beyaz" ?
          item.whitePrice * item.quantity : item.totalPrice;

        const itemData = [
          item.stockCode,
          item.productName,
          item.quantity,
          item.unit,
          formatCurrency(displayPrice),
          `%${item.vatRate}`,
          formatCurrency(totalDisplayPrice)
        ];
        tableRows.push(itemData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 }, // Küçük yazı
        headStyles: { fillColor: [60, 60, 60] }
      });
      
      // Toplam Tutar Bilgileri - Seçilen fiyat tipine göre
      const finalY = doc.lastAutoTable.finalY + 10;
      
      // Seçilen fiyat tipine göre toplam göster
      if (order.selectedPriceType === "beyaz") {
        doc.text(`Beyaz Fiyat Toplam: ${formatCurrency(order.totalWhitePrice)}`, 130, finalY);
      } else {
        doc.text(`KDV Dahil Toplam: ${formatCurrency(order.totalAmountWithVAT)}`, 130, finalY);
      }
      
      // PDF'i kaydet
      doc.save(`${order.customerName}_siparis_${order.date.replace(/\//g, '-')}.pdf`);

      // İndirilen siparişi işaretle
      const newDownloaded = { ...downloadedOrders, [order.id]: true };
      setDownloadedOrders(newDownloaded);
      localStorage.setItem('downloadedOrders', JSON.stringify(newDownloaded));

    } catch (error) {
      console.error("PDF oluşturma hatası:", error);
      alert("PDF oluşturulurken bir hata oluştu.");
    }
  };

  if (loading) {
    return <div className="loading">Siparişler yükleniyor...</div>;
  }

  return (
    <div className="order-history">
      <div className="order-history-header">
        <h2>Sipariş Geçmişi</h2>
        {orders.length > 0 && (
          <button 
            className="excel-export-button"
            onClick={() => exportOrdersToExcel(orders)}
          >
            Excel'e Aktar
          </button>
        )}
      </div>
      
      {orders.length === 0 ? (
        <p>Henüz sipariş bulunmuyor.</p>
      ) : (
        <div className="order-list">
          {orders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div>
                  <h3>{order.customerName}</h3>
                  <p className="order-phone">{order.customerPhone}</p>
                  <p className="order-date">{order.date}</p>
                  <p className="order-price-type">
                    {order.selectedPriceType === "beyaz" ? "Beyaz Fiyat" : "KDV Dahil Fiyat"}
                  </p>
                </div>
                <div className="order-actions">
                  <button
                    className="pdf-button"
                    onClick={() => generateOrderPDF(order)}
                  >
                    PDF İndir
                  </button>
                  {downloadedOrders[order.id] && (
                    <span className="downloaded-mark">✓ İndirildi</span>
                  )}
                </div>
              </div>
              
              <div className="order-summary">
                <p>Toplam {order.items.length} ürün</p>
                {/* Seçilen fiyat tipine göre toplam göster */}
                {order.selectedPriceType === "beyaz" ? (
                  <p><strong>Beyaz Fiyat:</strong> {formatCurrency(order.totalWhitePrice)}</p>
                ) : (
                  <p><strong>KDV Dahil:</strong> {formatCurrency(order.totalAmountWithVAT)}</p>
                )}
              </div>
              
              <details className="order-details">
                <summary>Sipariş Detayları</summary>
                <table className="order-items-table">
                  <thead>
                    <tr>
                      <th>Stok Kodu</th>
                      <th>Ürün</th>
                      <th>Miktar</th>
                      <th>Birim</th>
                      <th>Birim Fiyat</th>
                      <th>KDV</th>
                      <th>Toplam</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item, idx) => {
                      // Seçilen fiyat tipine göre gösterilecek fiyat
                      const displayPrice = order.selectedPriceType === "beyaz" ? 
                        item.whitePrice : (item.price * (1 + item.vatRate / 100));
                      
                      const totalDisplayPrice = order.selectedPriceType === "beyaz" ?
                        item.whitePrice * item.quantity : item.totalPrice;
                      
                      return (
                        <tr key={idx}>
                          <td>{item.stockCode}</td>
                          <td>{item.productName}</td>
                          <td>{item.quantity}</td>
                          <td>{item.unit}</td>
                          <td>{formatCurrency(displayPrice)}</td>
                          <td>%{item.vatRate}</td>
                          <td>{formatCurrency(totalDisplayPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OrderHistory;