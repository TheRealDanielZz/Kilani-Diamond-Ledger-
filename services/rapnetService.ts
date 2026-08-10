// ============================================================================
// rapnetService.ts — Rapnet Pricing Engine for Diamond Inventory Valuation
//
// Calculates diamond market values based on size (carat weight bracket), color,
// clarity, and shape (Round vs Fancy Shapes).
//
// Rules enforced:
//   1. Round diamonds use the dedicated Rapnet Round Price Matrix.
//   2. All other shapes (Pear, Oval, Princess, Emerald, Cushion, Radiant, Marquise,
//      Heart, Asscher, etc.) share the Rapnet Fancy Price Matrix.
//   3. Value = Carats × Rapnet Price per Carat ($/ct USD).
// ============================================================================

import { Diamond } from '../types';

export interface RapnetSizeBracket {
  minCt: number;
  maxCt: number;
  label: string;
}

export const RAPNET_SIZE_BRACKETS: RapnetSizeBracket[] = [
  { minCt: 0.01, maxCt: 0.17, label: '0.01 - 0.17 ct' },
  { minCt: 0.18, maxCt: 0.22, label: '0.18 - 0.22 ct' },
  { minCt: 0.23, maxCt: 0.29, label: '0.23 - 0.29 ct' },
  { minCt: 0.30, maxCt: 0.39, label: '0.30 - 0.39 ct' },
  { minCt: 0.40, maxCt: 0.49, label: '0.40 - 0.49 ct' },
  { minCt: 0.50, maxCt: 0.69, label: '0.50 - 0.69 ct' },
  { minCt: 0.70, maxCt: 0.89, label: '0.70 - 0.89 ct' },
  { minCt: 0.90, maxCt: 0.99, label: '0.90 - 0.99 ct' },
  { minCt: 1.00, maxCt: 1.49, label: '1.00 - 1.49 ct' },
  { minCt: 1.50, maxCt: 1.99, label: '1.50 - 1.99 ct' },
  { minCt: 2.00, maxCt: 2.99, label: '2.00 - 2.99 ct' },
  { minCt: 3.00, maxCt: 3.99, label: '3.00 - 3.99 ct' },
  { minCt: 4.00, maxCt: 4.99, label: '4.00 - 4.99 ct' },
  { minCt: 5.00, maxCt: 999.0, label: '5.00+ ct' },
];

export type ColorGrade = 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M';
export type ClarityGrade = 'IF' | 'VVS1' | 'VVS2' | 'VS1' | 'VS2' | 'SI1' | 'SI2' | 'SI3' | 'I1' | 'I2' | 'I3';

/**
 * Rapnet Price Matrix per Carat ($ USD / ct).
 * Structure: matrix[bracketLabel][color][clarity] = pricePerCaratUSD
 */
type ClarityPriceMap = Record<string, number>;
type ColorPriceMap = Record<string, ClarityPriceMap>;
type MatrixByBracket = Record<string, ColorPriceMap>;

// Helper to construct grid rows
function makeRow(
  ifP: number, vvs1P: number, vvs2P: number, vs1P: number, vs2P: number,
  si1P: number, si2P: number, si3P: number, i1P: number
): ClarityPriceMap {
  return {
    IF: ifP, VVS1: vvs1P, VVS2: vvs2P, VS1: vs1P, VS2: vs2P,
    SI1: si1P, SI2: si2P, SI3: si3P, I1: i1P, I2: Math.round(i1P * 0.75), I3: Math.round(i1P * 0.5)
  };
}

// ----------------------------------------------------------------------------
// 1. ROUND DIAMONDS RAPNET BENCHMARK MATRIX ($ USD / ct)
// ----------------------------------------------------------------------------
export const RAPNET_ROUND_MATRIX: MatrixByBracket = {
  '0.01 - 0.17 ct': {
    D: makeRow(1400, 1300, 1200, 1100, 1000, 850, 750, 650, 500),
    E: makeRow(1300, 1200, 1100, 1050, 950, 800, 700, 600, 480),
    F: makeRow(1200, 1100, 1050, 1000, 900, 780, 680, 580, 460),
    G: makeRow(1100, 1050, 1000, 950, 850, 750, 650, 550, 440),
    H: makeRow(1000, 950, 900, 850, 800, 720, 620, 520, 420),
    I: makeRow(900, 850, 800, 780, 740, 680, 580, 480, 390),
    J: makeRow(800, 750, 720, 700, 660, 600, 520, 440, 350),
    K: makeRow(700, 650, 620, 600, 570, 520, 450, 380, 310),
  },
  '0.18 - 0.22 ct': {
    D: makeRow(2100, 1900, 1750, 1600, 1450, 1250, 1050, 900, 700),
    E: makeRow(1950, 1780, 1650, 1500, 1380, 1180, 1000, 850, 660),
    F: makeRow(1800, 1650, 1550, 1420, 1300, 1120, 950, 800, 620),
    G: makeRow(1650, 1520, 1420, 1320, 1220, 1050, 900, 750, 580),
    H: makeRow(1500, 1400, 1300, 1220, 1120, 980, 840, 700, 540),
    I: makeRow(1350, 1260, 1180, 1100, 1020, 900, 780, 640, 500),
    J: makeRow(1200, 1120, 1050, 980, 910, 810, 700, 580, 450),
  },
  '0.23 - 0.29 ct': {
    D: makeRow(2600, 2350, 2150, 1950, 1750, 1500, 1280, 1080, 820),
    E: makeRow(2400, 2180, 2000, 1820, 1650, 1400, 1200, 1000, 770),
    F: makeRow(2220, 2020, 1860, 1700, 1540, 1320, 1140, 940, 720),
    G: makeRow(2050, 1880, 1740, 1580, 1440, 1240, 1060, 880, 680),
    H: makeRow(1880, 1720, 1600, 1460, 1330, 1150, 980, 820, 630),
    I: makeRow(1700, 1560, 1450, 1330, 1220, 1060, 900, 750, 580),
    J: makeRow(1500, 1380, 1280, 1180, 1080, 950, 810, 670, 520),
  },
  '0.30 - 0.39 ct': {
    D: makeRow(3600, 3200, 2900, 2600, 2350, 1950, 1650, 1350, 1000),
    E: makeRow(3300, 2950, 2700, 2450, 2200, 1850, 1550, 1280, 950),
    F: makeRow(3050, 2750, 2500, 2280, 2050, 1740, 1460, 1200, 900),
    G: makeRow(2800, 2550, 2320, 2120, 1900, 1630, 1370, 1120, 850),
    H: makeRow(2550, 2320, 2120, 1940, 1750, 1510, 1270, 1040, 790),
    I: makeRow(2300, 2100, 1920, 1760, 1590, 1380, 1160, 950, 730),
    J: makeRow(2050, 1880, 1720, 1580, 1430, 1240, 1050, 860, 660),
  },
  '0.40 - 0.49 ct': {
    D: makeRow(4400, 3900, 3500, 3150, 2800, 2350, 1950, 1600, 1200),
    E: makeRow(4050, 3600, 3250, 2950, 2620, 2220, 1840, 1500, 1130),
    F: makeRow(3750, 3350, 3020, 2740, 2450, 2090, 1730, 1410, 1060),
    G: makeRow(3450, 3100, 2800, 2540, 2280, 1950, 1620, 1320, 990),
    H: makeRow(3150, 2830, 2570, 2330, 2100, 1800, 1500, 1220, 920),
    I: makeRow(2850, 2570, 2330, 2120, 1910, 1640, 1370, 1110, 840),
    J: makeRow(2550, 2300, 2090, 1900, 1710, 1480, 1240, 1000, 760),
  },
  '0.50 - 0.69 ct': {
    D: makeRow(5200, 4500, 4100, 3700, 3300, 2800, 2300, 1900, 1400),
    E: makeRow(4600, 4100, 3800, 3500, 3100, 2650, 2180, 1790, 1320),
    F: makeRow(4200, 3800, 3500, 3250, 2900, 2500, 2060, 1690, 1240),
    G: makeRow(3700, 3400, 3200, 2950, 2650, 2320, 1920, 1570, 1150),
    H: makeRow(3350, 3050, 2850, 2650, 2400, 2120, 1760, 1440, 1060),
    I: makeRow(3000, 2750, 2550, 2380, 2160, 1920, 1600, 1310, 960),
    J: makeRow(2650, 2450, 2280, 2120, 1920, 1710, 1430, 1170, 860),
  },
  '0.70 - 0.89 ct': {
    D: makeRow(6800, 5900, 5300, 4800, 4300, 3600, 2950, 2400, 1750),
    E: makeRow(6050, 5350, 4850, 4400, 3950, 3350, 2760, 2240, 1630),
    F: makeRow(5450, 4850, 4420, 4040, 3640, 3110, 2570, 2090, 1520),
    G: makeRow(4850, 4350, 4000, 3670, 3320, 2860, 2370, 1930, 1400),
    H: makeRow(4300, 3880, 3580, 3290, 2980, 2580, 2150, 1750, 1270),
    I: makeRow(3780, 3420, 3170, 2920, 2650, 2300, 1920, 1560, 1140),
    J: makeRow(3280, 2980, 2770, 2560, 2320, 2020, 1690, 1370, 1000),
  },
  '0.90 - 0.99 ct': {
    D: makeRow(8800, 7600, 6800, 6100, 5400, 4500, 3650, 2950, 2100),
    E: makeRow(7750, 6800, 6150, 5550, 4950, 4150, 3400, 2740, 1950),
    F: makeRow(6900, 6100, 5550, 5020, 4480, 3800, 3140, 2530, 1800),
    G: makeRow(6100, 5450, 4980, 4520, 4040, 3450, 2860, 2310, 1640),
    H: makeRow(5350, 4800, 4400, 4010, 3600, 3090, 2570, 2070, 1480),
    I: makeRow(4650, 4180, 3840, 3510, 3160, 2720, 2270, 1830, 1310),
    J: makeRow(4000, 3600, 3310, 3030, 2730, 2360, 1970, 1590, 1140),
  },
  '1.00 - 1.49 ct': {
    D: makeRow(11500, 9800, 8900, 8100, 7300, 6200, 4900, 3900, 2800),
    E: makeRow(9900, 8700, 8000, 7400, 6700, 5800, 4600, 3650, 2600),
    F: makeRow(8800, 7900, 7300, 6800, 6200, 5400, 4400, 3450, 2450),
    G: makeRow(7700, 7000, 6500, 6100, 5600, 5000, 4100, 3200, 2280),
    H: makeRow(6700, 6100, 5700, 5380, 4980, 4480, 3720, 2900, 2070),
    I: makeRow(5700, 5200, 4890, 4620, 4300, 3900, 3280, 2560, 1840),
    J: makeRow(4800, 4400, 4150, 3920, 3660, 3340, 2820, 2200, 1590),
  },
  '1.50 - 1.99 ct': {
    D: makeRow(16500, 14000, 12600, 11400, 10200, 8500, 6800, 5300, 3700),
    E: makeRow(14200, 12300, 11200, 10200, 9200, 7800, 6300, 4900, 3400),
    F: makeRow(12400, 11000, 10100, 9250, 8400, 7200, 5850, 4550, 3180),
    G: makeRow(10800, 9700, 8900, 8250, 7550, 6600, 5400, 4200, 2920),
    H: makeRow(9300, 8400, 7750, 7220, 6650, 5880, 4850, 3780, 2630),
    I: makeRow(7800, 7100, 6600, 6180, 5700, 5100, 4220, 3300, 2300),
    J: makeRow(6500, 5950, 5550, 5200, 4800, 4320, 3600, 2800, 1960),
  },
  '2.00 - 2.99 ct': {
    D: makeRow(24500, 20500, 18200, 16500, 14800, 12200, 9500, 7300, 5000),
    E: makeRow(20800, 17800, 16000, 14500, 13100, 11000, 8700, 6600, 4500),
    F: makeRow(17900, 15500, 14100, 12900, 11700, 9900, 7950, 6050, 4120),
    G: makeRow(15200, 13600, 12500, 11500, 10400, 9100, 7300, 5500, 3750),
    H: makeRow(12900, 11600, 10700, 9900, 9050, 7980, 6450, 4880, 3320),
    I: makeRow(10700, 9700, 8950, 8300, 7650, 6800, 5550, 4200, 2870),
    J: makeRow(8800, 8000, 7420, 6900, 6400, 5700, 4680, 3550, 2430),
  },
  '3.00 - 3.99 ct': {
    D: makeRow(36000, 30000, 26500, 23800, 21000, 17200, 13300, 10100, 6800),
    E: makeRow(30500, 25800, 23000, 20800, 18500, 15300, 12050, 9100, 6150),
    F: makeRow(26000, 22300, 20000, 18200, 16300, 13750, 10900, 8250, 5550),
    G: makeRow(21800, 19200, 17400, 15900, 14300, 12300, 9800, 7450, 5000),
    H: makeRow(18200, 16200, 14800, 13600, 12350, 10700, 8600, 6550, 4400),
    I: makeRow(15000, 13400, 12300, 11300, 10300, 9000, 7300, 5550, 3750),
    J: makeRow(12200, 11000, 10100, 9350, 8550, 7550, 6150, 4680, 3180),
  },
  '4.00 - 4.99 ct': {
    D: makeRow(46000, 38500, 34000, 30500, 26800, 22000, 17000, 12800, 8600),
    E: makeRow(39000, 33000, 29200, 26400, 23400, 19400, 15250, 11500, 7750),
    F: makeRow(33000, 28300, 25200, 22900, 20400, 17200, 13700, 10350, 6950),
    G: makeRow(27600, 24200, 21800, 19900, 17800, 15200, 12200, 9280, 6220),
    H: makeRow(22800, 20200, 18400, 16850, 15200, 13150, 10650, 8100, 5420),
    I: makeRow(18600, 16600, 15200, 13950, 12650, 11000, 8950, 6800, 4580),
    J: makeRow(15000, 13500, 12400, 11450, 10450, 9200, 7500, 5700, 3850),
  },
  '5.00+ ct': {
    D: makeRow(58000, 48000, 42000, 37500, 33000, 27000, 20800, 15600, 10500),
    E: makeRow(49000, 41000, 36200, 32500, 28800, 23800, 18600, 14000, 9450),
    F: makeRow(41200, 35200, 31200, 28200, 25100, 21000, 16600, 12550, 8450),
    G: makeRow(34400, 30000, 26900, 24400, 21800, 18500, 14800, 11200, 7520),
    H: makeRow(28200, 24900, 22550, 20600, 18550, 15950, 12900, 9780, 6550),
    I: makeRow(22900, 20400, 18600, 17050, 15400, 13350, 10850, 8220, 5520),
    J: makeRow(18400, 16500, 15150, 13950, 12700, 11150, 9100, 6900, 4650),
  }
};

// ----------------------------------------------------------------------------
// 2. FANCY SHAPES RAPNET BENCHMARK MATRIX ($ USD / ct)
// (Applies to all non-round shapes: Pear, Oval, Princess, Emerald, Cushion,
//  Radiant, Marquise, Heart, Asscher, Trilliant, Baguette, etc.)
// ----------------------------------------------------------------------------
export const RAPNET_FANCY_MATRIX: MatrixByBracket = {
  '0.01 - 0.17 ct': {
    D: makeRow(1150, 1050, 975, 890, 800, 680, 590, 510, 390),
    E: makeRow(1050, 970, 890, 835, 750, 630, 550, 470, 370),
    F: makeRow(975, 890, 835, 795, 715, 615, 535, 455, 355),
    G: makeRow(890, 835, 795, 750, 675, 590, 510, 430, 340),
    H: makeRow(800, 750, 715, 675, 635, 565, 485, 405, 325),
    I: makeRow(715, 675, 635, 615, 585, 535, 455, 375, 300),
    J: makeRow(635, 590, 565, 545, 515, 470, 405, 345, 275),
    K: makeRow(550, 510, 485, 470, 445, 405, 350, 295, 240),
  },
  '0.18 - 0.22 ct': {
    D: makeRow(1650, 1500, 1380, 1260, 1140, 980, 820, 700, 540),
    E: makeRow(1530, 1400, 1300, 1180, 1080, 925, 785, 665, 515),
    F: makeRow(1415, 1300, 1215, 1115, 1020, 880, 745, 625, 485),
    G: makeRow(1300, 1195, 1115, 1035, 955, 825, 705, 585, 455),
    H: makeRow(1180, 1100, 1020, 955, 880, 770, 660, 545, 420),
    I: makeRow(1060, 990, 925, 860, 800, 705, 610, 500, 390),
    J: makeRow(940, 880, 825, 770, 715, 635, 545, 455, 350),
  },
  '0.23 - 0.29 ct': {
    D: makeRow(2050, 1850, 1690, 1530, 1380, 1180, 1000, 850, 640),
    E: makeRow(1890, 1715, 1570, 1430, 1300, 1100, 940, 785, 600),
    F: makeRow(1745, 1590, 1460, 1335, 1210, 1035, 895, 740, 565),
    G: makeRow(1610, 1480, 1365, 1240, 1130, 970, 830, 690, 530),
    H: makeRow(1475, 1350, 1255, 1145, 1045, 900, 770, 645, 495),
    I: makeRow(1335, 1225, 1140, 1045, 955, 830, 705, 590, 455),
    J: makeRow(1180, 1085, 1005, 925, 845, 745, 635, 525, 405),
  },
  '0.30 - 0.39 ct': {
    D: makeRow(2850, 2520, 2280, 2050, 1850, 1530, 1300, 1060, 780),
    E: makeRow(2600, 2320, 2125, 1930, 1730, 1455, 1220, 1005, 745),
    F: makeRow(2400, 2165, 1965, 1795, 1610, 1365, 1145, 940, 705),
    G: makeRow(2200, 2005, 1825, 1665, 1495, 1280, 1075, 880, 665),
    H: makeRow(2005, 1825, 1665, 1525, 1375, 1185, 995, 815, 620),
    I: makeRow(1805, 1650, 1510, 1380, 1250, 1085, 910, 745, 570),
    J: makeRow(1610, 1475, 1350, 1240, 1120, 975, 825, 675, 515),
  },
  '0.40 - 0.49 ct': {
    D: makeRow(3450, 3060, 2740, 2470, 2200, 1845, 1530, 1255, 940),
    E: makeRow(3175, 2825, 2545, 2315, 2055, 1740, 1445, 1175, 885),
    F: makeRow(2940, 2630, 2365, 2150, 1920, 1640, 1355, 1105, 830),
    G: makeRow(2705, 2435, 2195, 1990, 1785, 1530, 1270, 1035, 775),
    H: makeRow(2470, 2220, 2015, 1825, 1645, 1410, 1175, 955, 720),
    I: makeRow(2235, 2015, 1825, 1660, 1495, 1285, 1075, 870, 655),
    J: makeRow(2000, 1805, 1635, 1490, 1340, 1160, 970, 785, 595),
  },
  '0.50 - 0.69 ct': {
    D: makeRow(4200, 3600, 3300, 3000, 2700, 2300, 1900, 1550, 1150),
    E: makeRow(3700, 3300, 3050, 2800, 2500, 2150, 1780, 1455, 1080),
    F: makeRow(3380, 3050, 2810, 2610, 2330, 2015, 1680, 1375, 1015),
    G: makeRow(2980, 2730, 2570, 2370, 2130, 1865, 1565, 1275, 940),
    H: makeRow(2695, 2450, 2290, 2130, 1930, 1705, 1435, 1170, 865),
    I: makeRow(2410, 2210, 2050, 1915, 1735, 1545, 1300, 1060, 785),
    J: makeRow(2130, 1970, 1835, 1705, 1545, 1375, 1165, 950, 705),
  },
  '0.70 - 0.89 ct': {
    D: makeRow(5450, 4735, 4255, 3850, 3450, 2890, 2365, 1925, 1400),
    E: makeRow(4850, 4295, 3895, 3530, 3170, 2690, 2215, 1795, 1305),
    F: makeRow(4370, 3895, 3550, 3240, 2920, 2495, 2060, 1675, 1220),
    G: makeRow(3895, 3495, 3215, 2945, 2665, 2295, 1900, 1550, 1120),
    H: makeRow(3450, 3115, 2875, 2640, 2390, 2070, 1725, 1405, 1020),
    I: makeRow(3035, 2745, 2545, 2345, 2125, 1845, 1540, 1250, 915),
    J: makeRow(2635, 2390, 2225, 2055, 1860, 1620, 1355, 1100, 800),
  },
  '0.90 - 0.99 ct': {
    D: makeRow(7050, 6100, 5450, 4890, 4335, 3610, 2930, 2365, 1685),
    E: makeRow(6215, 5450, 4930, 4450, 3970, 3330, 2730, 2200, 1565),
    F: makeRow(5535, 4890, 4450, 4025, 3595, 3050, 2520, 2030, 1445),
    G: makeRow(4890, 4370, 3995, 3625, 3240, 2765, 2295, 1850, 1315),
    H: makeRow(4290, 3850, 3530, 3215, 2890, 2475, 2060, 1660, 1185),
    I: makeRow(3730, 3355, 3080, 2815, 2535, 2180, 1820, 1470, 1050),
    J: makeRow(3210, 2890, 2655, 2430, 2190, 1895, 1580, 1275, 915),
  },
  '1.00 - 1.49 ct': {
    D: makeRow(8900, 7600, 6900, 6300, 5700, 4800, 3800, 3050, 2180),
    E: makeRow(7680, 6745, 6200, 5735, 5195, 4495, 3565, 2830, 2015),
    F: makeRow(6820, 6120, 5655, 5270, 4805, 4185, 3410, 2675, 1900),
    G: makeRow(5965, 5425, 5035, 4730, 4340, 3875, 3175, 2480, 1765),
    H: makeRow(5195, 4730, 4415, 4170, 3860, 3470, 2885, 2250, 1605),
    I: makeRow(4415, 4030, 3790, 3580, 3330, 3020, 2540, 1985, 1425),
    J: makeRow(3720, 3410, 3215, 3040, 2835, 2590, 2185, 1705, 1230),
  },
  '1.50 - 1.99 ct': {
    D: makeRow(12800, 10850, 9760, 8835, 7900, 6590, 5270, 4110, 2870),
    E: makeRow(11000, 9535, 8680, 7905, 7130, 6045, 4880, 3800, 2635),
    F: makeRow(9610, 8525, 7830, 7170, 6510, 5580, 4535, 3525, 2465),
    G: makeRow(8370, 7515, 6900, 6395, 5850, 5115, 4185, 3255, 2265),
    H: makeRow(7210, 6510, 6005, 5595, 5155, 4555, 3760, 2930, 2040),
    I: makeRow(6045, 5500, 5115, 4790, 4415, 3955, 3270, 2560, 1780),
    J: makeRow(5035, 4610, 4300, 4030, 3720, 3350, 2790, 2170, 1520),
  },
  '2.00 - 2.99 ct': {
    D: makeRow(18500, 15500, 13800, 12500, 11200, 9200, 7200, 5500, 3800),
    E: makeRow(15700, 13450, 12100, 10980, 9915, 8330, 6590, 5000, 3410),
    F: makeRow(13500, 11710, 10650, 9770, 8850, 7500, 6020, 4585, 3120),
    G: makeRow(11500, 10280, 9460, 8700, 7875, 6890, 5530, 4165, 2840),
    H: makeRow(9765, 8780, 8100, 7490, 6850, 6040, 4880, 3695, 2515),
    I: makeRow(8100, 7345, 6775, 6285, 5790, 5145, 4200, 3180, 2175),
    J: makeRow(6660, 6055, 5615, 5220, 4845, 4315, 3540, 2690, 1840),
  },
  '3.00 - 3.99 ct': {
    D: makeRow(26800, 22350, 19740, 17730, 15645, 12810, 9910, 7525, 5065),
    E: makeRow(22705, 19220, 17135, 15495, 13780, 11395, 8975, 6780, 4585),
    F: makeRow(19355, 16610, 14900, 13560, 12145, 10245, 8120, 6145, 4135),
    G: makeRow(16230, 14305, 12960, 11845, 10655, 9165, 7300, 5550, 3725),
    H: makeRow(13550, 12065, 11025, 10130, 9200, 7970, 6405, 4880, 3275),
    I: makeRow(11175, 9980, 9160, 8420, 7675, 6705, 5440, 4135, 2795),
    J: makeRow(9090, 8195, 7525, 6965, 6370, 5625, 4580, 3485, 2370),
  },
  '4.00 - 4.99 ct': {
    D: makeRow(34250, 28680, 25335, 22725, 19965, 16380, 12665, 9535, 6410),
    E: makeRow(29050, 24585, 21755, 19670, 17435, 14450, 11360, 8565, 5775),
    F: makeRow(24585, 21085, 18775, 17060, 15195, 12810, 10205, 7710, 5180),
    G: makeRow(20560, 18030, 16240, 14825, 13260, 11325, 9090, 6915, 4635),
    H: makeRow(16985, 15050, 13710, 12555, 11325, 9800, 7935, 6035, 4040),
    I: makeRow(13855, 12370, 11325, 10395, 9425, 8205, 6670, 5065, 3410),
    J: makeRow(11175, 10055, 9240, 8530, 7785, 6855, 5590, 4245, 2870),
  },
  '5.00+ ct': {
    D: makeRow(43200, 35760, 31290, 27940, 24585, 20115, 15495, 11620, 7820),
    E: makeRow(36505, 30545, 26970, 24210, 21450, 17730, 13860, 10430, 7040),
    F: makeRow(30695, 26225, 23245, 21010, 18700, 15645, 12370, 9350, 6295),
    G: makeRow(25630, 22350, 20040, 18180, 16240, 13785, 11025, 8345, 5600),
    H: makeRow(21010, 18550, 16800, 15350, 13820, 11885, 9610, 7285, 4880),
    I: makeRow(17060, 15200, 13860, 12700, 11475, 9945, 8080, 6125, 4115),
    J: makeRow(13710, 12300, 11285, 10395, 9460, 8310, 6780, 5140, 3465),
  }
};

/**
 * Determine weight bracket label for a given carat size.
 */
export function getRapnetSizeBracket(sizeCt: number): RapnetSizeBracket {
  const size = Math.max(0.01, sizeCt);
  for (const b of RAPNET_SIZE_BRACKETS) {
    if (size >= b.minCt && size <= b.maxCt) {
      return b;
    }
  }
  // Fallback to top bracket for very large stones (5.00+ ct)
  return RAPNET_SIZE_BRACKETS[RAPNET_SIZE_BRACKETS.length - 1];
}

/**
 * Normalise raw shape string into 'ROUND' vs 'FANCY'.
 */
export function getRapnetShapeCategory(shape?: string): 'ROUND' | 'FANCY' {
  const norm = (shape || '').trim().toUpperCase();
  if (norm === 'ROUND' || norm === 'RD' || norm === 'RND' || norm === 'BRILLIANT') {
    return 'ROUND';
  }
  return 'FANCY';
}

/**
 * Normalise raw Color grade string (e.g. 'D', 'E', 'F/G' -> 'F', etc.)
 */
export function normalizeColorGrade(color?: string): ColorGrade {
  if (!color) return 'G';
  const c = color.trim().toUpperCase();
  if (['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].includes(c)) {
    return c as ColorGrade;
  }
  // Handle double letters like F/G -> F, G/H -> G
  const firstLetter = c.charAt(0);
  if (['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'].includes(firstLetter)) {
    return firstLetter as ColorGrade;
  }
  return 'G'; // Safe median default
}

/**
 * Normalise raw Clarity grade string (e.g. 'VVS1', 'VS2', etc.)
 */
export function normalizeClarityGrade(clarity?: string): ClarityGrade {
  if (!clarity) return 'VS2';
  const cl = clarity.trim().toUpperCase().replace(/\s+/g, '');
  if (['IF', 'FL', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'SI3', 'I1', 'I2', 'I3'].includes(cl)) {
    if (cl === 'FL') return 'IF';
    return cl as ClarityGrade;
  }
  return 'VS2'; // Safe median default
}

/**
 * Lookup Rapnet Price per Carat ($ USD / ct) based on Shape, Size, Color, Clarity.
 */
export function getRapnetPricePerCt(
  shape?: string,
  sizeCt?: number,
  color?: string,
  clarity?: string
): number {
  const ct = sizeCt || 0.5;
  const category = getRapnetShapeCategory(shape);
  const bracket = getRapnetSizeBracket(ct);
  const col = normalizeColorGrade(color);
  const clar = normalizeClarityGrade(clarity);

  const matrix = category === 'ROUND' ? RAPNET_ROUND_MATRIX : RAPNET_FANCY_MATRIX;
  const bracketData = matrix[bracket.label];

  if (!bracketData) return category === 'ROUND' ? 2400 : 2000;

  const colorRow = bracketData[col] || bracketData['G'];
  if (!colorRow) return category === 'ROUND' ? 2400 : 2000;

  const price = colorRow[clar] || colorRow['VS2'];
  return price || (category === 'ROUND' ? 2400 : 2000);
}

/**
 * Calculate full estimated value of a single Diamond record using Rapnet.
 */
export function calculateDiamondRapnetValue(diamond: Pick<Diamond, 'shape' | 'size' | 'color' | 'clarity'>): {
  pricePerCt: number;
  totalValue: number;
  shapeCategory: 'ROUND' | 'FANCY';
  bracketLabel: string;
} {
  const size = diamond.size || 0;
  const category = getRapnetShapeCategory(diamond.shape);
  const bracket = getRapnetSizeBracket(size);
  const pricePerCt = getRapnetPricePerCt(diamond.shape, size, diamond.color, diamond.clarity);
  const totalValue = Math.round(size * pricePerCt);

  return {
    pricePerCt,
    totalValue,
    shapeCategory: category,
    bracketLabel: bracket.label,
  };
}

export interface RapnetInventorySummary {
  totalCount: number;
  totalCarats: number;
  totalValueUsd: number;
  avgPricePerCtUsd: number;
  roundCount: number;
  roundCarats: number;
  roundValueUsd: number;
  avgRoundPricePerCt: number;
  fancyCount: number;
  fancyCarats: number;
  fancyValueUsd: number;
  avgFancyPricePerCt: number;
  diamondsWithValues: (Diamond & {
    rapnetPricePerCt: number;
    rapnetTotalValue: number;
    shapeCategory: 'ROUND' | 'FANCY';
    bracketLabel: string;
  })[];
}

/**
 * Compute authoritative Rapnet inventory summary for a list of diamonds (e.g. Toronto location).
 */
export function calculateRapnetInventorySummary(diamonds: Diamond[]): RapnetInventorySummary {
  const totalCount = diamonds.length;
  let totalCarats = 0;
  let totalValueUsd = 0;

  let roundCount = 0;
  let roundCarats = 0;
  let roundValueUsd = 0;

  let fancyCount = 0;
  let fancyCarats = 0;
  let fancyValueUsd = 0;

  const diamondsWithValues = diamonds.map((d) => {
    const size = d.size || 0;
    const { pricePerCt, totalValue, shapeCategory, bracketLabel } = calculateDiamondRapnetValue(d);

    totalCarats += size;
    totalValueUsd += totalValue;

    if (shapeCategory === 'ROUND') {
      roundCount += 1;
      roundCarats += size;
      roundValueUsd += totalValue;
    } else {
      fancyCount += 1;
      fancyCarats += size;
      fancyValueUsd += totalValue;
    }

    return {
      ...d,
      rapnetPricePerCt: pricePerCt,
      rapnetTotalValue: totalValue,
      shapeCategory,
      bracketLabel,
    };
  });

  const avgPricePerCtUsd = totalCarats > 0 ? Math.round(totalValueUsd / totalCarats) : 0;
  const avgRoundPricePerCt = roundCarats > 0 ? Math.round(roundValueUsd / roundCarats) : 0;
  const avgFancyPricePerCt = fancyCarats > 0 ? Math.round(fancyValueUsd / fancyCarats) : 0;

  return {
    totalCount,
    totalCarats,
    totalValueUsd,
    avgPricePerCtUsd,
    roundCount,
    roundCarats,
    roundValueUsd,
    avgRoundPricePerCt,
    fancyCount,
    fancyCarats,
    fancyValueUsd,
    avgFancyPricePerCt,
    diamondsWithValues,
  };
}
