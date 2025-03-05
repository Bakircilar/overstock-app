// uploadProducts.js
import { supabase } from './supabaseClient';
import Papa from 'papaparse';

// Türkçe formatındaki sayıları doğru şekilde parse etmek için geliştirilmiş fonksiyon
// Binlik ayracı noktaları (.) kaldırır ve ondalık ayracı virgülü (,) noktaya (.) çevirir
function parseTurkishFloat(val) {
  if (!val) return 0;
  if (typeof val !== 'string') return parseFloat(val) || 0;
  
  // Önce binlik ayracı noktaları kaldır, sonra virgülü noktaya çevir
  return parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0;
}

const uploadProductsFromCSV = async (file) => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ";", // Noktalı virgül ayracı kullanıyoruz
      complete: async (results) => {
        console.log("CSV Verisi:", results.data); // Gelen verileri kontrol için logla
        
        // CSV'den gelen satırları Supabase'e uygun formata dönüştür
        const products = results.data.map(row => {
          const product = {
            stockCode: row.stockCode || '',
            name: row.name || '',
            price: parseTurkishFloat(row.price),
            stock: parseInt(row.stock) || 0,
            category: row.category || 'Diğer',
            vatRate: parseTurkishFloat(row.vatRate),
            unit: row.unit || 'Adet',
            entryCost: parseTurkishFloat(row.entryCost),
            latestCost: parseTurkishFloat(row.latestCost),
            // Tarih formatını CSV'de YYYY-MM-DD olarak tuttuğunuzu varsayıyoruz
            entryDate: row.entryDate || new Date().toISOString().split('T')[0],
            latestCostDate: row.latestCostDate || new Date().toISOString().split('T')[0]
          };
          
          console.log(`${row.name} fiyatı: ${row.price} -> ${product.price}`); // Dönüşümü kontrol et
          return product;
        });

        try {
          // 1) Mevcut ürünleri temizle
          const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .not('id', 'is', null);

          if (deleteError) {
            console.error("Veritabanı temizleme hatası:", deleteError);
            reject(deleteError);
            return;
          }

          // 2) Yeni ürünleri ekle
          const { error: insertError } = await supabase
            .from('products')
            .insert(products);

          if (insertError) {
            console.error("Veri yükleme hatası:", insertError);
            reject(insertError);
            return;
          }

          alert(`${products.length} ürün başarıyla yüklendi!`);
          resolve(products);

          // Yükleme sonrası sayfayı yenileyerek en güncel ürün listesini göster
          window.location.reload(); 
        } catch (error) {
          console.error("CSV yükleme hatası:", error);
          reject(error);
        }
      },
      error: (error) => {
        console.error("CSV okuma hatası:", error);
        reject(error);
      }
    });
  });
};

export default uploadProductsFromCSV;