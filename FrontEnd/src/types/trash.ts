export type TrashType = 'ALL' | 'CATEGORY' | 'SUBJECT' | 'COURSE' | 'CLASS' | 'REVIEW';

export interface TrashActor {
  id: string;
  email: string | null;
  fullName: string;
}

export interface TrashItem {
  id: string;
  type: 'CATEGORY' | 'SUBJECT' | 'COURSE' | 'CLASS' | 'REVIEW';
  typeLabel: string;
  title: string;
  codeOrSlug: string;
  parentInfo?: string;
  originalStatus: string;
  deletedAt: string;
  deletedBy: TrashActor | null;
  deleteReason: string;
  canRestore?: boolean;
  restoreBlockReason?: string | null;
  canPermanentDelete?: boolean;
  permanentDeleteBlockReason?: string | null;
}

export interface TrashFilterQuery {
  type?: TrashType;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface TrashListResponse {
  items: TrashItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
