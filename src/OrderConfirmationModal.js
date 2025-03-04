// OrderConfirmationModal.js
import React from 'react';
import './OrderConfirmationModal.css';

const OrderConfirmationModal = ({ 
  show, 
  onClose, 
  onConfirm, 
  orderItems, 
  customerName,
  customerPhone,
  totalOrderAmount, 
  totalOrderAmountWithVAT,
  totalWhitePriceAmount,
  selectedPriceType, // Seçilen fiyat tipi
  formatCurrency 
}) => {
  if (!show) return null;

  // Seçilen fiyat tipine göre görüntülenecek toplam
  const selectedTotal = selectedPriceType === "kdvDahil" 
    ? totalOrderAmountWithVAT 
    : totalWhitePriceAmount;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Sipariş Onayı</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p><strong>Firma: </strong>{customerName}</p>
          <p><strong>Telefon: </strong>{customerPhone}</p>
          <p><strong>Fiyat Türü: </strong>{selectedPriceType === "kdvDahil" ? "KDV Dahil Fiyat" : "Beyaz Fiyat"}</p>
          
          <div className="order-summary-table">
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Miktar</th>
                  <th>Birim</th>
                  <th>Birim Fiyat</th>
                  <th>Toplam Tutar</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map(item => {
                  // Seçilen fiyat tipine göre birim fiyat ve toplam
                  const displayPrice = selectedPriceType === "kdvDahil" 
                    ? item.price * (1 + item.vatRate / 100) 
                    : item.price * (1 + item.vatRate / 200);
                  
                  const totalDisplayPrice = displayPrice * item.quantity;
                  
                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.quantity}</td>
                      <td>{item.unit}</td>
                      <td>{formatCurrency(displayPrice)}</td>
                      <td>{formatCurrency(totalDisplayPrice)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="order-totals">
            {/* Seçilen fiyat tipine göre gösterim */}
            {selectedPriceType === "kdvDahil" ? (
              <p><strong>KDV Dahil Toplam:</strong> {formatCurrency(totalOrderAmountWithVAT)}</p>
            ) : (
              <p><strong>Beyaz Fiyat Toplam:</strong> {formatCurrency(totalWhitePriceAmount)}</p>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="cancel-button" onClick={onClose}>İptal</button>
          <button className="confirm-button" onClick={onConfirm}>Siparişi Onayla</button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationModal;