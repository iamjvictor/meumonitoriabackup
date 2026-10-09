export type RegistrationStep = 1 | 2 | 3 | 4;

export interface TeacherRegistrationForm {
  fullName: string;
  email: string;
  password?: string;
  phone: string;
  docType: 'CPF' | 'CNPJ';
  documentNumber: string;
  username: string;
  area: string;
  customArea?: string;
  bio: string;
  pageSlug: string;
  avatarUrl?: string;
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  agreedTerms: boolean;
}

export interface TeacherProfile {
  id: string;
  userId: string;
  displayName: string;
  slug: string;
  bio: string;
  area: string;
  status: 'pending' | 'approved' | 'suspended';
  avatarUrl?: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  teacherId: string;
  name: string;
  description: string;
  objective: string;
  status: 'draft' | 'published' | 'inactive';
  priceMonthly: number;
  subcategories: string[];
  createdAt: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  category: 'geral' | 'professor' | 'aluno' | 'seguranca';
}

export interface QuestionExtraction {
  id: string;
  statement: string;
  options: {
    letter: string;
    text: string;
  }[];
  correctAnswerLetter: string;
  explanation: string;
  subcategory: string;
  difficulty: 'fácil' | 'médio' | 'difícil';
  status: 'pending_review' | 'approved' | 'archived';
}
