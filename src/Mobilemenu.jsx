// src/mobileMenu.js
const mobileMenuButton = document.querySelector('.mobile-menu-button');
const mobileMenu = document.querySelector('.mobile-menu');

mobileMenuButton.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
});

import { useEffect } from "react";

const Mobilemenu = () => {
  useEffect(() => {
    const menuButton = document.querySelector(".menu-button");
    
    if (!menuButton) return; // Prevents error if element is missing

    const toggleMenu = () => {
      console.log("Menu toggled");
    };

    menuButton.addEventListener("click", toggleMenu);

    return () => menuButton.removeEventListener("click", toggleMenu);
  }, []); // Empty dependency array ensures it runs once after mount

  return (
    <button className="menu-button">
      Menu
    </button>
  );
};

export default Mobilemenu;
