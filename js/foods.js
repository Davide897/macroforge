// Base de alimentos. Valores por 100 g (peso cru para carnes, peixe e cereais).
// Fonte: USDA SR Legacy 2018-04 (auditado a 2026-10-25), com hidratos À MODA DA UE (sem fibra),
// como nos rótulos portugueses, e kcal pela fórmula da UE (4·P + 4·H + 9·G + 2·fibra; Reg. UE 1169/2011). Produtos europeus sem equivalente USDA (fiambre, skyr, queijo fresco,
// carcaça, pão integral PT, whey, chocolate 85%...) usam valores típicos de rótulo.
// cat: prot | protfat | dairy | carb | fat | veg | fruit
// m: em que refeições faz sentido — B pequeno-almoço, M almoço/jantar, S lanche
// por: porção por defeito (g) · max: máximo por refeição (g) · step: arredondamento (g)
// unit: unidade natural (ex.: 1 ovo = 55 g)
(function () {
  const MF = window.MF || (window.MF = {});
  const F = (id, pt, en, cat, k, p, c, f, fb, m, o = {}) =>
    Object.assign({ id, pt, en, cat, k, p, c, f, fb, m }, o);

  MF.FOODS = [
    // Proteína magra
    F('frango', 'Peito de frango (cru)', 'Chicken breast (raw)', 'prot', 113, 22.5, 0, 2.6, 0, 'M', { por: 150, max: 300 }),
    F('peru', 'Peito de peru (cru)', 'Turkey breast (raw)', 'prot', 109, 23.7, 0.1, 1.5, 0, 'M', { por: 150, max: 300 }),
    F('atum', 'Atum ao natural (escorrido)', 'Tuna in water (drained)', 'prot', 109, 25.5, 0, 0.8, 0, 'MS', { por: 112, max: 240, unit: { g: 56, pt: 'lata', en: 'can' } }),
    F('pescada', 'Pescada (crua)', 'Hake (raw)', 'prot', 75, 17, 0, 0.8, 0, 'M', { por: 200, max: 350 }),
    F('bacalhau', 'Bacalhau demolhado', 'Salt cod (soaked)', 'prot', 78, 17.8, 0, 0.7, 0, 'M', { por: 180, max: 350 }),
    F('camarao', 'Camarão (cru)', 'Shrimp (raw)', 'prot', 85, 20.1, 0, 0.5, 0, 'M', { por: 150, max: 300 }),
    F('vaca5', 'Carne picada de vaca 5%', 'Lean ground beef 5%', 'prot', 131, 21.4, 0, 5, 0, 'M', { por: 150, max: 300 }),
    F('alcatra', 'Bife de vaca (alcatra, cru)', 'Beef steak (rump, raw)', 'prot', 134, 22.7, 0, 4.8, 0, 'M', { por: 150, max: 300 }),
    F('lombo', 'Lombo de porco (cru)', 'Pork loin (raw)', 'prot', 121, 22, 0, 3.7, 0, 'M', { por: 150, max: 300 }),
    F('claras', 'Claras de ovo', 'Egg whites', 'prot', 48, 10.9, 0.7, 0.2, 0, 'BS', { por: 150, max: 300, step: 10 }),
    F('whey', 'Whey protein', 'Whey protein', 'prot', 380, 78, 7, 5, 0, 'BS', { por: 30, max: 60, unit: { g: 30, pt: 'scoop', en: 'scoop' } }),
    F('fiambre', 'Fiambre de peru', 'Turkey ham slices', 'prot', 105, 18, 2, 3, 0, 'BS', { por: 60, max: 120, step: 10 }),
    // Proteína com gordura
    F('ovo', 'Ovo inteiro', 'Whole egg', 'protfat', 139, 12.6, 0.7, 9.5, 0, 'BMS', { por: 110, max: 220, unit: { g: 55, pt: 'ovo', en: 'egg' } }),
    F('salmao', 'Salmão (cru)', 'Salmon (raw)', 'protfat', 202, 20.4, 0, 13.4, 0, 'M', { por: 150, max: 250 }),
    F('sardinha', 'Sardinha', 'Sardines', 'protfat', 165, 20, 0, 9.5, 0, 'M', { por: 150, max: 250 }),
    F('vaca15', 'Carne picada de vaca 15%', 'Ground beef 15%', 'protfat', 209, 18.6, 0, 15, 0, 'M', { por: 150, max: 250 }),
    F('tofu', 'Tofu firme', 'Firm tofu', 'protfat', 154, 17.3, 0.5, 8.7, 2.3, 'M', { por: 150, max: 300 }),
    // Laticínios
    F('grego0', 'Iogurte grego natural 0%', 'Greek yogurt 0%', 'dairy', 59, 10.2, 3.6, 0.4, 0, 'BS', { por: 170, max: 500, step: 10 }),
    F('skyr', 'Skyr natural', 'Plain skyr', 'dairy', 63, 11, 4, 0.2, 0, 'BS', { por: 150, max: 500, step: 10 }),
    F('qfresco', 'Queijo fresco magro', 'Low-fat fresh cheese', 'dairy', 90, 12, 3.5, 3, 0, 'BS', { por: 100, max: 250, step: 10 }),
    F('cottage', 'Queijo cottage', 'Cottage cheese', 'dairy', 97, 11.1, 3.4, 4.3, 0, 'BS', { por: 150, max: 300, step: 10 }),
    F('leite', 'Leite meio-gordo', 'Semi-skimmed milk', 'dairy', 47, 3.3, 4.8, 1.6, 0, 'B', { por: 250, max: 500, step: 50 }),
    // Hidratos
    F('arroz', 'Arroz branco (cru)', 'White rice (raw)', 'carb', 352, 7.1, 78.7, 0.7, 1.3, 'M', { por: 80, max: 200 }),
    F('arrozint', 'Arroz integral (cru)', 'Brown rice (raw)', 'carb', 357, 7.5, 72.7, 3.2, 3.6, 'M', { por: 80, max: 200 }),
    F('massa', 'Massa (crua)', 'Pasta (raw)', 'carb', 358, 13, 71.5, 1.5, 3.2, 'M', { por: 80, max: 200 }),
    F('massaint', 'Massa integral (crua)', 'Whole-wheat pasta (raw)', 'carb', 357, 13.9, 64.2, 2.9, 9.2, 'M', { por: 80, max: 200 }),
    F('batata', 'Batata (crua)', 'Potato (raw)', 'carb', 75, 2, 15.4, 0.1, 2.1, 'M', { por: 300, max: 800, step: 10 }),
    F('batatadoce', 'Batata-doce (crua)', 'Sweet potato (raw)', 'carb', 82, 1.6, 17.1, 0.1, 3, 'M', { por: 250, max: 700, step: 10 }),
    F('quinoa', 'Quinoa (crua)', 'Quinoa (raw)', 'carb', 354, 14.1, 57.2, 6.1, 7, 'M', { por: 70, max: 180 }),
    F('cuscuz', 'Cuscuz (cru)', 'Couscous (raw)', 'carb', 356, 12.8, 72.4, 0.6, 5, 'M', { por: 70, max: 180 }),
    F('feijao', 'Feijão cozido (escorrido)', 'Cooked beans (drained)', 'carb', 117, 8, 16, 1.1, 5.5, 'M', { por: 150, max: 400, step: 10 }),
    F('grao', 'Grão-de-bico cozido', 'Cooked chickpeas', 'carb', 130, 7, 16.1, 2.8, 6.4, 'M', { por: 150, max: 400, step: 10 }),
    F('lentilhas', 'Lentilhas cozidas', 'Cooked lentils', 'carb', 104, 9, 12.2, 0.4, 7.9, 'M', { por: 150, max: 400, step: 10 }),
    F('aveia', 'Flocos de aveia', 'Rolled oats', 'carb', 362, 13.2, 57.6, 6.5, 10.1, 'BS', { por: 60, max: 150 }),
    F('paoint', 'Pão integral', 'Whole-grain bread', 'carb', 245, 10, 43, 3.5, 7, 'BS', { por: 60, max: 180, unit: { g: 30, pt: 'fatia', en: 'slice' } }),
    F('pao', 'Pão (carcaça)', 'White bread roll', 'carb', 270, 9, 55, 1.5, 3, 'BS', { por: 50, max: 150, unit: { g: 50, pt: 'carcaça', en: 'roll' } }),
    F('tortilha', 'Tortilha de trigo', 'Wheat tortilla', 'carb', 293, 8, 46.9, 7.6, 2.4, 'BMS', { por: 40, max: 160, unit: { g: 40, pt: 'tortilha', en: 'tortilla' } }),
    F('bolacharroz', 'Bolachas de arroz', 'Rice cakes', 'carb', 376, 8.2, 77.3, 2.8, 4.2, 'BS', { por: 24, max: 80, unit: { g: 8, pt: 'bolacha', en: 'cake' } }),
    F('cereais', 'Corn flakes', 'Corn flakes', 'carb', 375, 7, 84, 0.9, 3, 'B', { por: 40, max: 120 }),
    F('mel', 'Mel', 'Honey', 'carb', 330, 0.3, 82.2, 0, 0.2, 'BS', { por: 15, max: 30 }),
    // Fruta (porção fixa)
    F('banana', 'Banana', 'Banana', 'fruit', 93, 1.1, 20.2, 0.3, 2.6, 'BS', { por: 120, unit: { g: 120, pt: 'banana', en: 'banana' } }),
    F('maca', 'Maçã', 'Apple', 'fruit', 53, 0.3, 11.4, 0.2, 2.4, 'BS', { por: 150, unit: { g: 150, pt: 'maçã', en: 'apple' } }),
    F('laranja', 'Laranja', 'Orange', 'fruit', 46, 0.9, 9.3, 0.1, 2.4, 'BS', { por: 150, unit: { g: 150, pt: 'laranja', en: 'orange' } }),
    F('pera', 'Pera', 'Pear', 'fruit', 57, 0.4, 12.1, 0.1, 3.1, 'BS', { por: 160, unit: { g: 160, pt: 'pera', en: 'pear' } }),
    F('kiwi', 'Kiwi', 'Kiwi', 'fruit', 62, 1.1, 11.7, 0.5, 3, 'BS', { por: 150, unit: { g: 75, pt: 'kiwi', en: 'kiwi' } }),
    F('frutosverm', 'Frutos vermelhos (congelados)', 'Mixed berries (frozen)', 'fruit', 50, 0.9, 8.6, 0.5, 3.8, 'BS', { por: 100 }),
    F('uvas', 'Uvas', 'Grapes', 'fruit', 75, 0.7, 17.2, 0.2, 0.9, 'BS', { por: 100 }),
    // Legumes (porção fixa)
    F('brocolos', 'Brócolos', 'Broccoli', 'veg', 36, 2.8, 4, 0.4, 2.6, 'M', { por: 200 }),
    F('espinafres', 'Espinafres', 'Spinach', 'veg', 25, 2.9, 1.4, 0.4, 2.2, 'M', { por: 150 }),
    F('salada', 'Salada (alface + tomate)', 'Salad (lettuce + tomato)', 'veg', 18, 1.1, 2.2, 0.2, 1.3, 'M', { por: 200 }),
    F('cenoura', 'Cenoura', 'Carrot', 'veg', 38, 0.9, 6.8, 0.2, 2.8, 'M', { por: 150 }),
    F('feijaoverde', 'Feijão-verde', 'Green beans', 'veg', 32, 1.8, 4.3, 0.2, 2.7, 'M', { por: 200 }),
    F('courgette', 'Courgette', 'Zucchini', 'veg', 18, 1.2, 2.1, 0.3, 1, 'M', { por: 200 }),
    F('cogumelos', 'Cogumelos', 'Mushrooms', 'veg', 26, 3.1, 2.3, 0.3, 1, 'M', { por: 150 }),
    F('legumescong', 'Mistura de legumes (congelada)', 'Mixed vegetables (frozen)', 'veg', 64, 3.3, 9.5, 0.5, 4, 'M', { por: 200 }),
    // Gorduras
    F('azeite', 'Azeite', 'Olive oil', 'fat', 900, 0, 0, 100, 0, 'M', { por: 10, max: 25, step: 1 }),
    F('abacate', 'Abacate', 'Avocado', 'fat', 161, 2, 1.8, 14.7, 6.7, 'BM', { por: 70, max: 150 }),
    F('mamendoim', 'Manteiga de amendoim', 'Peanut butter', 'fat', 590, 25, 15, 50, 6, 'BS', { por: 15, max: 40, step: 1 }),
    F('amendoas', 'Amêndoas', 'Almonds', 'fat', 595, 21.1, 9.1, 49.9, 12.5, 'BS', { por: 20, max: 40, step: 1 }),
    F('nozes', 'Nozes', 'Walnuts', 'fat', 689, 15.2, 7, 65.2, 6.7, 'BS', { por: 20, max: 40, step: 1 }),
    F('chia', 'Sementes de chia', 'Chia seeds', 'fat', 442, 16.5, 7.7, 30.7, 34.4, 'B', { por: 10, max: 25, step: 1 }),
    F('chocnegro', 'Chocolate negro 85%', 'Dark chocolate 85%', 'fat', 600, 10, 20, 50, 11, 'S', { por: 15, max: 30, step: 1 }),
    F('qflamengo', 'Queijo flamengo', 'Gouda-style cheese', 'fat', 330, 25, 1, 25, 0, 'BS', { por: 20, max: 60, step: 1 }),
    F('manteiga', 'Manteiga', 'Butter', 'fat', 734, 0.8, 0.1, 81.1, 0, 'B', { por: 5, max: 15, step: 1 }),
  ];


  // Medidas caseiras (g por medida). Valores típicos de tabelas de medidas domésticas (USDA);
  // são aproximações — uma colher "cheia" pode pesar o dobro de uma rasa.
  const CS = 'csopa', CC = 'ccha';
  const MEAS = {
    azeite: [[CS, 13.5], [CC, 4.5]], manteiga: [[CS, 14], [CC, 5]], mamendoim: [[CS, 16], [CC, 5]],
    mel: [[CS, 21], [CC, 7]], chia: [[CS, 12], [CC, 4]], amendoas: [['punhado', 30]], nozes: [['punhado', 30]],
    chocnegro: [['quadrado', 5]], abacate: [['metade', 70]], qflamengo: [['fatia', 20]], fiambre: [['fatia', 15]],
    aveia: [['chav', 80], [CS, 5]], arroz: [['chav', 185], [CS, 12]], arrozint: [['chav', 185], [CS, 12]],
    quinoa: [['chav', 170], [CS, 11]], cuscuz: [['chav', 175], [CS, 11]], cereais: [['chav', 28]],
    feijao: [['chav', 170], [CS, 15]], grao: [['chav', 165], [CS, 15]], lentilhas: [['chav', 200], [CS, 15]],
    leite: [['copo', 250], ['chav', 240]], grego0: [[CS, 20]], skyr: [[CS, 20]], qfresco: [[CS, 20]], cottage: [[CS, 20]],
    claras: [['clara', 33], [CS, 15]], batata: [['media', 170]], batatadoce: [['media', 130]],
    frutosverm: [['chav', 140]], uvas: [['chav', 150]],
    brocolos: [['chav', 90]], espinafres: [['chav', 30]], salada: [['chav', 50]], cenoura: [['chav', 110]],
    feijaoverde: [['chav', 110]], courgette: [['chav', 115]], cogumelos: [['chav', 70]], legumescong: [['chav', 130]],
  };
  for (const f of MF.FOODS) if (MEAS[f.id]) f.meas = MEAS[f.id];
  MF.SPOONS = [CS, CC];

  // Seleção rápida para quem quer começar já
  MF.BASICS = ['frango', 'peru', 'atum', 'ovo', 'claras', 'whey', 'grego0', 'arroz', 'massa', 'batata',
    'batatadoce', 'aveia', 'paoint', 'banana', 'maca', 'brocolos', 'salada', 'legumescong', 'azeite', 'mamendoim'];

  MF.CATS = ['prot', 'protfat', 'dairy', 'carb', 'fat', 'veg', 'fruit'];
})();
