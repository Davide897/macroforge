// Base de alimentos. Valores por 100 g da parte comestível já cozinhada para carnes,
// peixe, ovos, cereais e legumes. Fruta, laticínios e produtos prontos mantêm o estado
// em que são consumidos; a salada mantém-se fresca. Os alimentos cozinhados usam porções
// em gramas já cozinhadas.
// Fonte principal: USDA FoodData Central SR Legacy 2018-04; claras cozinhadas usam FNDDS 2021-2023.
// Pescada/bacalhau usam como referência o registo de bacalhau do Atlântico cozinhado, por falta de um equivalente cozinhado exato.
// Hidratos À MODA DA UE (sem fibra),
// como nos rótulos portugueses, e kcal pela fórmula da UE (4·P + 4·H + 9·G + 2·fibra; Reg. UE 1169/2011). Produtos europeus sem equivalente USDA (fiambre, skyr, queijo fresco,
// carcaça, pão integral PT, whey, chocolate 85%...) usam valores típicos de rótulo.
// cat: prot | protfat | dairy | carb | fat | veg | fruit
// m: em que refeições faz sentido — B pequeno-almoço, M almoço/jantar, S lanche
// por: porção por defeito (g) · max: máximo por refeição (g) · step: arredondamento (g)
// unit: unidade natural (ex.: 1 ovo cozido = 50 g)
(function () {
  const MF = window.MF || (window.MF = {});
  const F = (id, pt, en, cat, k, p, c, f, fb, m, o = {}) =>
    Object.assign({ id, pt, en, cat, k, p, c, f, fb, m }, o);

  MF.FOODS = [
    // Proteína magra
    F('frango', 'Peito de frango cozinhado', 'Cooked chicken breast', 'prot', 157, 32.06, 0, 3.24, 0, 'M', { por: 150, max: 300 }),
    F('peru', 'Peito de peru assado', 'Roasted turkey breast', 'prot', 140, 30.13, 0, 2.08, 0, 'M', { por: 150, max: 300 }),
    F('atum', 'Atum ao natural (escorrido)', 'Tuna in water (drained)', 'prot', 109, 25.5, 0, 0.8, 0, 'MS', { por: 112, max: 240, unit: { g: 56, pt: 'lata', en: 'can' } }),
    F('pescada', 'Pescada cozinhada', 'Cooked hake', 'prot', 97, 22.8, 0, 0.86, 0, 'M', { por: 200, max: 350 }),
    F('bacalhau', 'Bacalhau cozido (demolhado)', 'Boiled salt cod (soaked)', 'prot', 97, 22.8, 0, 0.86, 0, 'M', { por: 180, max: 350 }),
    F('camarao', 'Camarão cozido', 'Cooked shrimp', 'prot', 99, 23.98, 0.2, 0.28, 0, 'M', { por: 150, max: 300 }),
    F('vaca5', 'Carne picada de vaca 5%, cozinhada', 'Cooked 95% lean ground beef', 'prot', 185, 29.17, 0, 7.58, 0, 'M', { por: 150, max: 300 }),
    F('alcatra', 'Bife de vaca magro, grelhado', 'Grilled lean beef steak', 'prot', 179, 30.29, 0, 6.55, 0, 'M', { por: 150, max: 300 }),
    F('lombo', 'Lombo de porco assado', 'Roasted pork loin', 'prot', 165, 27.2, 0, 6.28, 0, 'M', { por: 150, max: 300 }),
    F('claras', 'Claras de ovo cozinhadas', 'Cooked egg whites', 'prot', 52, 10.67, 2.35, 0, 0, 'BS', { por: 150, max: 300, step: 10 }),
    F('whey', 'Whey protein', 'Whey protein', 'prot', 380, 78, 7, 5, 0, 'BS', { por: 30, max: 60, unit: { g: 30, pt: 'scoop', en: 'scoop' } }),
    F('fiambre', 'Fiambre de peru', 'Turkey ham slices', 'prot', 105, 18, 2, 3, 0, 'BS', { por: 60, max: 120, step: 10 }),
    // Proteína com gordura
    F('ovo', 'Ovo cozido', 'Hard-boiled egg', 'protfat', 150, 12.58, 1.12, 10.61, 0, 'BMS', { por: 100, max: 200, unit: { g: 50, pt: 'ovo', en: 'egg' } }),
    F('salmao', 'Salmão de aquacultura cozinhado', 'Cooked farmed salmon', 'protfat', 200, 22.1, 0, 12.35, 0, 'M', { por: 150, max: 250 }),
    F('sardinha', 'Sardinha em conserva, escorrida', 'Canned sardines, drained', 'protfat', 201, 24.62, 0, 11.45, 0, 'M', { por: 150, max: 250 }),
    F('vaca15', 'Carne picada de vaca 15%, cozinhada', 'Cooked 85% lean ground beef', 'protfat', 249, 27.7, 0, 15.3, 0, 'M', { por: 150, max: 250 }),
    F('tofu', 'Tofu firme', 'Firm tofu', 'protfat', 154, 17.3, 0.5, 8.7, 2.3, 'M', { por: 150, max: 300 }),
    // Laticínios
    F('grego0', 'Iogurte grego natural 0%', 'Greek yogurt 0%', 'dairy', 59, 10.2, 3.6, 0.4, 0, 'BS', { por: 170, max: 500, step: 10 }),
    F('skyr', 'Skyr natural', 'Plain skyr', 'dairy', 63, 11, 4, 0.2, 0, 'BS', { por: 150, max: 500, step: 10 }),
    F('qfresco', 'Queijo fresco magro', 'Low-fat fresh cheese', 'dairy', 90, 12, 3.5, 3, 0, 'BS', { por: 100, max: 250, step: 10 }),
    F('cottage', 'Queijo cottage', 'Cottage cheese', 'dairy', 97, 11.1, 3.4, 4.3, 0, 'BS', { por: 150, max: 300, step: 10 }),
    F('leite', 'Leite meio-gordo', 'Semi-skimmed milk', 'dairy', 47, 3.3, 4.8, 1.6, 0, 'B', { por: 250, max: 500, step: 50 }),
    // Hidratos
    F('arroz', 'Arroz branco cozido', 'Cooked white rice', 'carb', 125, 2.69, 27.77, 0.28, 0.4, 'M', { por: 180, max: 450 }),
    F('arrozint', 'Arroz integral cozido', 'Cooked brown rice', 'carb', 119, 2.74, 23.98, 0.97, 1.6, 'M', { por: 180, max: 450 }),
    F('massa', 'Massa cozida', 'Cooked pasta', 'carb', 151, 5.8, 29.06, 0.93, 1.8, 'M', { por: 180, max: 450 }),
    F('massaint', 'Massa integral cozida', 'Cooked whole-wheat pasta', 'carb', 152, 5.99, 26.17, 1.71, 3.9, 'M', { por: 180, max: 450 }),
    F('batata', 'Batata cozida', 'Boiled potato', 'carb', 85, 1.87, 18.33, 0.1, 1.8, 'M', { por: 220, max: 600, step: 10 }),
    F('batatadoce', 'Batata-doce cozida', 'Boiled sweet potato', 'carb', 73, 1.37, 15.22, 0.14, 2.5, 'M', { por: 200, max: 600, step: 10 }),
    F('quinoa', 'Quinoa cozida', 'Cooked quinoa', 'carb', 114, 4.4, 18.5, 1.92, 2.8, 'M', { por: 185, max: 450 }),
    F('cuscuz', 'Cuscuz cozido', 'Cooked couscous', 'carb', 107, 3.79, 21.82, 0.16, 1.4, 'M', { por: 157, max: 400 }),
    F('feijao', 'Feijão cozido (escorrido)', 'Cooked beans (drained)', 'carb', 117, 8, 16, 1.1, 5.5, 'M', { por: 150, max: 400, step: 10 }),
    F('grao', 'Grão-de-bico cozido', 'Cooked chickpeas', 'carb', 130, 7, 16.1, 2.8, 6.4, 'M', { por: 150, max: 400, step: 10 }),
    F('lentilhas', 'Lentilhas cozidas', 'Cooked lentils', 'carb', 104, 9, 12.2, 0.4, 7.9, 'M', { por: 150, max: 400, step: 10 }),
    F('aveia', 'Papas de aveia cozinhadas em água', 'Oatmeal cooked with water', 'carb', 68, 2.54, 10.3, 1.52, 1.7, 'BS', { por: 250, max: 600 }),
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
    F('brocolos', 'Brócolos cozidos', 'Boiled broccoli', 'veg', 35, 2.38, 3.88, 0.41, 3.3, 'M', { por: 200 }),
    F('espinafres', 'Espinafres cozidos', 'Boiled spinach', 'veg', 24, 2.97, 1.35, 0.26, 2.4, 'M', { por: 150 }),
    F('salada', 'Salada fresca (alface + tomate)', 'Fresh salad (lettuce + tomato)', 'veg', 18, 1.1, 2.2, 0.2, 1.3, 'M', { por: 200 }),
    F('cenoura', 'Cenoura cozida', 'Boiled carrot', 'veg', 32, 0.76, 5.22, 0.18, 3, 'M', { por: 150 }),
    F('feijaoverde', 'Feijão-verde cozido', 'Boiled green beans', 'veg', 35, 1.89, 4.68, 0.28, 3.2, 'M', { por: 200 }),
    F('courgette', 'Courgette cozida', 'Boiled zucchini', 'veg', 17, 1.14, 1.69, 0.36, 1, 'M', { por: 200 }),
    F('cogumelos', 'Cogumelos cozidos', 'Boiled mushrooms', 'veg', 30, 2.17, 3.09, 0.47, 2.2, 'M', { por: 150 }),
    F('legumescong', 'Mistura de legumes cozidos', 'Cooked mixed vegetables', 'veg', 56, 2.86, 8.69, 0.15, 4.4, 'M', { por: 200 }),
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
    aveia: [['chav', 234]], arroz: [['chav', 158], [CS, 12]], arrozint: [['chav', 195], [CS, 12]],
    quinoa: [['chav', 185], [CS, 11]], cuscuz: [['chav', 157], [CS, 11]], cereais: [['chav', 28]],
    feijao: [['chav', 170], [CS, 15]], grao: [['chav', 165], [CS, 15]], lentilhas: [['chav', 200], [CS, 15]],
    leite: [['copo', 250], ['chav', 240]], grego0: [[CS, 20]], skyr: [[CS, 20]], qfresco: [[CS, 20]], cottage: [[CS, 20]],
    claras: [['clara', 33], [CS, 15]], batata: [['media', 170]], batatadoce: [['media', 130]],
    frutosverm: [['chav', 140]], uvas: [['chav', 150]],
    brocolos: [['chav', 156]], espinafres: [['chav', 180]], salada: [['chav', 50]], cenoura: [['chav', 156]],
    feijaoverde: [['chav', 125]], courgette: [['chav', 180]], cogumelos: [['chav', 156]], legumescong: [['chav', 182]],
  };
  for (const f of MF.FOODS) if (MEAS[f.id]) f.meas = MEAS[f.id];
  MF.SPOONS = [CS, CC];

  // Seleção rápida para quem quer começar já
  MF.BASICS = ['frango', 'peru', 'atum', 'ovo', 'claras', 'whey', 'grego0', 'arroz', 'massa', 'batata',
    'batatadoce', 'aveia', 'paoint', 'banana', 'maca', 'brocolos', 'salada', 'legumescong', 'azeite', 'mamendoim'];

  MF.CATS = ['prot', 'protfat', 'dairy', 'carb', 'fat', 'veg', 'fruit'];
})();
