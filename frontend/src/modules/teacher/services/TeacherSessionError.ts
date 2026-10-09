export class TeacherSessionError extends Error {
  constructor() {
    super('Sua sessão expirou. Entre novamente para continuar.');
    this.name = 'TeacherSessionError';
  }
}
