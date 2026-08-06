export interface PredefinedTeam {
  name: string;
  flagCode: string;
  color: string;
}

export const WORLD_CUP_TEAMS: PredefinedTeam[] = [
  // CONCACAF (6)
  { name: 'United States', flagCode: 'us', color: '#002868' },
  { name: 'Canada', flagCode: 'ca', color: '#FF0000' },
  { name: 'Mexico', flagCode: 'mx', color: '#006847' },
  { name: 'Costa Rica', flagCode: 'cr', color: '#CE1126' },
  { name: 'Panama', flagCode: 'pa', color: '#DA291C' },
  { name: 'Jamaica', flagCode: 'jm', color: '#009B3A' },

  // CONMEBOL (7)
  { name: 'Argentina', flagCode: 'ar', color: '#43A1D5' },
  { name: 'Brazil', flagCode: 'br', color: '#FFDF00' },
  { name: 'Colombia', flagCode: 'co', color: '#FCD116' },
  { name: 'Uruguay', flagCode: 'uy', color: '#0038A8' },
  { name: 'Ecuador', flagCode: 'ec', color: '#FFD100' },
  { name: 'Chile', flagCode: 'cl', color: '#D52B1E' },
  { name: 'Peru', flagCode: 'pe', color: '#D91023' },

  // UEFA (16)
  { name: 'France', flagCode: 'fr', color: '#002395' },
  { name: 'England', flagCode: 'gb-eng', color: '#CF081F' },
  { name: 'Spain', flagCode: 'es', color: '#AA151B' },
  { name: 'Germany', flagCode: 'de', color: '#000000' },
  { name: 'Italy', flagCode: 'it', color: '#0066B2' },
  { name: 'Portugal', flagCode: 'pt', color: '#FF0000' },
  { name: 'Netherlands', flagCode: 'nl', color: '#F36C21' },
  { name: 'Belgium', flagCode: 'be', color: '#EF3340' },
  { name: 'Croatia', flagCode: 'hr', color: '#FF0000' },
  { name: 'Denmark', flagCode: 'dk', color: '#C60C30' },
  { name: 'Switzerland', flagCode: 'ch', color: '#FF0000' },
  { name: 'Serbia', flagCode: 'rs', color: '#C6363C' },
  { name: 'Poland', flagCode: 'pl', color: '#DC143C' },
  { name: 'Sweden', flagCode: 'se', color: '#FECC00' },
  { name: 'Ukraine', flagCode: 'ua', color: '#0057B7' },
  { name: 'Wales', flagCode: 'gb-wls', color: '#D30731' },

  // CAF (9)
  { name: 'Morocco', flagCode: 'ma', color: '#C1272D' },
  { name: 'Senegal', flagCode: 'sn', color: '#00853F' },
  { name: 'Egypt', flagCode: 'eg', color: '#CE1126' },
  { name: 'Nigeria', flagCode: 'ng', color: '#008751' },
  { name: 'Algeria', flagCode: 'dz', color: '#006233' },
  { name: 'Ivory Coast', flagCode: 'ci', color: '#F77F00' },
  { name: 'Cameroon', flagCode: 'cm', color: '#007A5E' },
  { name: 'Ghana', flagCode: 'gh', color: '#006B3F' },
  { name: 'Tunisia', flagCode: 'tn', color: '#E70013' },

  // AFC (9)
  { name: 'Japan', flagCode: 'jp', color: '#000555' },
  { name: 'South Korea', flagCode: 'kr', color: '#0047A0' },
  { name: 'Iran', flagCode: 'ir', color: '#239F40' },
  { name: 'Saudi Arabia', flagCode: 'sa', color: '#006C35' },
  { name: 'Australia', flagCode: 'au', color: '#FFCD00' },
  { name: 'Qatar', flagCode: 'qa', color: '#8A1538' },
  { name: 'UAE', flagCode: 'ae', color: '#00732F' },
  { name: 'Iraq', flagCode: 'iq', color: '#007A3D' },
  { name: 'Uzbekistan', flagCode: 'uz', color: '#0099B5' },

  // OFC (1)
  { name: 'New Zealand', flagCode: 'nz', color: '#00247D' }
];
