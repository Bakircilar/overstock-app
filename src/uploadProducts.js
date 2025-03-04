// uploadProducts.js
import Papa from 'papaparse';
import { supabase } from './supabaseClient';

export default function uploadProductsFromCSV(file) {
  if (!file) {
    alert("Lütfen bir CSV dosyası seçin.");
    return;
  }
  
  Papa.parse(file, {
    header: true,
    delimiter: ";", // Noktalı virgül ayraç olarak kullanılacak
    skipEmptyLines: true,
    complete: async (results) => {
      console.log("CSV parse sonucu:", results.data);
      const csvData = results.data.map(row => ({
        stockCode: row["item.stockCode"] || "",
        name: row["item.name"] || "",
        price: parseFloat(row["item.price"] || 0),
        stock: parseInt(row["item.stock"] || 0, 10),
        category: row["item.category"] || "",
        vatRate: parseFloat(row["item.vatRate"] || 18),
        unit: row["item.unit"] || ""
      }));

      try {
        const { error } = await supabase
          .from('products')
          .insert(csvData);

        if (error) {
          console.error("Ürün yüklemede hata:", error);
          alert("Ürün yüklemede hata oluştu!");
        } else {
          alert("Ürünler başarıyla yüklendi!");
        }
      } catch (err) {
        console.error(err);
        alert("Ürün yüklemede beklenmedik bir hata oluştu!");
      }
    },
    error: (err) => {
      console.error("CSV Parse hatası:", err);
      alert("CSV dosyası okunurken hata oluştu!");
    }
  });
}
