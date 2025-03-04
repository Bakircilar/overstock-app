// WhatsAppWidget.js
import React from 'react';

const WhatsAppWidget = () => {
  return (
    <a 
      href="https://wa.me/905301783570?text=Merhaba, kampanya sisteminiz ile ilgili bilgi almak istiyorum." 
      target="_blank" 
      rel="noopener noreferrer"
      style={{
        position: "fixed",
        bottom: "20px",
        right: "20px",
        backgroundColor: "#25D366",
        color: "white",
        borderRadius: "50%",
        width: "60px",
        height: "60px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontSize: "30px",
        zIndex: 1000
      }}
    >
      {/* Eğer Font Awesome kullanıyorsan: */}
      <i className="fab fa-whatsapp"></i>
      {/* Alternatif olarak, SVG ikon da ekleyebilirsin */}
    </a>
  );
};

export default WhatsAppWidget;
