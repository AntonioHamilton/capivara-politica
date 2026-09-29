// centro aproximado de cada UF (coordenada da capital) — suficiente pra achar o estado mais
// próximo a partir da localização do navegador, sem depender de um serviço externo de geocoding
const CENTRO_UF: Record<string, [number, number]> = {
  AC: [-9.97, -67.81],
  AL: [-9.65, -35.71],
  AP: [0.04, -51.05],
  AM: [-3.1, -60.02],
  BA: [-12.97, -38.51],
  CE: [-3.73, -38.52],
  DF: [-15.78, -47.93],
  ES: [-20.32, -40.34],
  GO: [-16.68, -49.25],
  MA: [-2.53, -44.3],
  MT: [-15.6, -56.1],
  MS: [-20.44, -54.65],
  MG: [-19.92, -43.94],
  PA: [-1.46, -48.5],
  PB: [-7.12, -34.86],
  PR: [-25.43, -49.27],
  PE: [-8.05, -34.9],
  PI: [-5.09, -42.8],
  RJ: [-22.91, -43.17],
  RN: [-5.79, -35.21],
  RS: [-30.03, -51.23],
  RO: [-8.76, -63.9],
  RR: [2.82, -60.67],
  SC: [-27.6, -48.55],
  SP: [-23.55, -46.63],
  SE: [-10.91, -37.07],
  TO: [-10.25, -48.32],
};

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// aproximado — perto de divisas entre estados pode errar pro vizinho, mas não precisa de
// nenhuma chamada externa (nem chave de API) pra funcionar
export function estadoMaisProximo(lat: number, lon: number): string {
  let melhor = 'SE';
  let menorDist = Infinity;
  for (const [uf, [clat, clon]] of Object.entries(CENTRO_UF)) {
    const d = distanciaKm(lat, lon, clat, clon);
    if (d < menorDist) {
      menorDist = d;
      melhor = uf;
    }
  }
  return melhor;
}
