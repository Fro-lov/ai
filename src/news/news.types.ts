export interface RawNewsItem {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  image?: string;
  date: string;
  author?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NewsApiResponse {
  success: boolean;
  data: RawNewsItem[];
}

export interface NewsSummaryItem {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  author?: string;
}
