// OrderConfirmationModal.js
import React from 'react';
import './OrderConfirmationModal.css'; // Modal için stil dosyası

const OrderConfirmationModal = ({ 
  show, 
  onClose, 
  onConfirm, 
  orderItems, 
  customerName, 
  totalOrderAmount, 
  totalOrderAmountWithVAT,
  totalWhitePriceAmount,
  formatCurrency 
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Sipariş Onayı</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <p><strong>Firma: </strong>{customerName}</p>
          
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
                {orderItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{formatCurrency(item.price)}</td>
                    <td>{formatCurrency(item.totalPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="order-totals">
            <p><strong>KDV Hariç Toplam:</strong> {formatCurrency(totalOrderAmount)}</p>
            <p><strong>KDV Dahil Toplam:</strong> {formatCurrency(totalOrderAmountWithVAT)}</p>
            <p><strong>Beyaz Fiyat Toplam:</strong> {formatCurrency(totalWhitePriceAmount)}</p>
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