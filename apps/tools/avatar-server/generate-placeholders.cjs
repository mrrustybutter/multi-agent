#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Define expressions with colors and emojis
const expressions = [
  { name: 'joyful', color: '#FFD700', emoji: '😊' },
  { name: 'focused', color: '#4169E1', emoji: '🧐' },
  { name: 'confused', color: '#FFA500', emoji: '😕' },
  { name: 'frustrated', color: '#DC143C', emoji: '😤' },
  { name: 'excited', color: '#FF69B4', emoji: '🤩' },
  { name: 'thinking', color: '#9370DB', emoji: '🤔' },
  { name: 'sleepy', color: '#708090', emoji: '😴' },
  { name: 'surprised', color: '#00CED1', emoji: '😲' }
];

const imagesDir = path.join(__dirname, 'public', 'images');

// Ensure images directory exists
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Generate SVG for each expression
expressions.forEach(({ name, color, emoji }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <!-- Background circle -->
  <circle cx="256" cy="256" r="240" fill="${color}" opacity="0.9"/>
  
  <!-- Inner circle for face -->
  <circle cx="256" cy="256" r="200" fill="#FFF8DC" stroke="${color}" stroke-width="8"/>
  
  <!-- Emoji representation -->
  <text x="256" y="280" font-family="Arial, sans-serif" font-size="160" text-anchor="middle" fill="${color}">${emoji}</text>
  
  <!-- Expression name -->
  <text x="256" y="440" font-family="Arial, sans-serif" font-size="32" text-anchor="middle" fill="${color}" font-weight="bold">${name.toUpperCase()}</text>
  
  <!-- Decorative elements -->
  <circle cx="150" cy="200" r="30" fill="${color}" opacity="0.3"/>
  <circle cx="362" cy="200" r="30" fill="${color}" opacity="0.3"/>
</svg>`;

  const filename = path.join(imagesDir, `${name}.svg`);
  fs.writeFileSync(filename, svg);
  console.log(`Created ${filename}`);
});

console.log(`\nGenerated ${expressions.length} placeholder avatar expressions in ${imagesDir}`);