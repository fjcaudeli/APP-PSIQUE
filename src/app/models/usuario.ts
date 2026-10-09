// La API devuelve solamente datos públicos de la cuenta, nunca el hash.
export interface Usuario {
  id: number;
  email: string;
  fechaCreacion: string;
}

export interface RespuestaLogin {
  token: string;
  usuario: Usuario;
  expiraEn: number;
}
