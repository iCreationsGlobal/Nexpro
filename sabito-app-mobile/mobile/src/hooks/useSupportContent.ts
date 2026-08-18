import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPPORT_CONFIG, DEBUG_CONFIG } from '../config/env';

// Configuration from environment
const SUPPORT_CONTENT_URL = SUPPORT_CONFIG.contentURL;
const CACHE_KEY = SUPPORT_CONFIG.cacheKey;
const CACHE_DURATION = SUPPORT_CONFIG.cacheDuration;

export interface SupportArticle {
  id: string;
  title: string;
  content: string;
  topicId?: string;
  [key: string]: any;
}

export interface SupportTopic {
  id: string;
  title: string;
  [key: string]: any;
}

export interface SupportContent {
  topics: SupportTopic[];
  articles: SupportArticle[];
  faq?: SupportArticle[];
  contacts?: Record<string, any>;
  version?: string;
}

interface CacheData {
  data: SupportContent;
  timestamp: number;
  version: string;
}

export interface UseSupportContentReturn {
  content: SupportContent | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearCache: () => Promise<void>;
  topics: SupportTopic[];
  articles: SupportArticle[];
  faq: SupportArticle[];
  contacts: Record<string, any>;
  version: string | null;
}

/**
 * Hook to fetch and cache support content from Sabito website
 * Works in both web and mobile apps with localStorage/AsyncStorage
 * 
 * @returns {UseSupportContentReturn} { content, loading, error, refresh }
 */
export const useSupportContent = (): UseSupportContentReturn => {
  const [content, setContent] = useState<SupportContent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadContent();
  }, []);

  const loadContent = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);

      // Try cache first
      const cached = await getCache();
      if (cached) {
        setContent(cached);
        setLoading(false);
        
        // Fetch fresh content in background
        fetchFreshContent();
        return;
      }

      // No cache, fetch immediately
      await fetchFreshContent();
    } catch (err: any) {
      setError(err.message || 'Failed to load support content');
      setLoading(false);
    }
  };

  const fetchFreshContent = async (): Promise<void> => {
    try {
      if (DEBUG_CONFIG.enabled) {
        // Debug logging if needed
      }
      
      const response = await fetch(SUPPORT_CONTENT_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: SupportContent = await response.json();
      
      if (!data || !data.topics || !data.articles) {
        throw new Error('Invalid support content format');
      }
      // Update state
      setContent(data);
      setLoading(false);

      // Cache it
      await setCache(data);
    } catch (err: any) {
      if (!content) {
        // Only set error if we don't have cached content
        setError(err.message);
        setLoading(false);
      }
    }
  };

  const getCache = async (): Promise<SupportContent | null> => {
    try {
      const stored = await AsyncStorage.getItem(CACHE_KEY);
      if (!stored) return null;

      const { data, timestamp }: CacheData = JSON.parse(stored);
      const age = Date.now() - timestamp;

      // Check if cache is still valid
      if (age < CACHE_DURATION) {
        return data;
      }
      return null;
    } catch (err) {
      return null;
    }
  };

  const setCache = async (data: SupportContent): Promise<void> => {
    try {
      const cacheData: CacheData = {
        data,
        timestamp: Date.now(),
        version: data.version || '1.0.0'
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (err) {
      // Non-critical error, don't throw
    }
  };

  const clearCache = async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
    } catch (err) {
      // Error handling
    }
  };

  const refresh = async (): Promise<void> => {
    await clearCache();
    await loadContent();
  };

  return {
    content,
    loading,
    error,
    refresh,
    clearCache,
    // Helper getters
    topics: content?.topics || [],
    articles: content?.articles || [],
    faq: content?.faq || [],
    contacts: content?.contacts || {},
    version: content?.version || null,
  };
};

export interface UseArticlesByTopicReturn {
  articles: SupportArticle[];
  loading: boolean;
  error: string | null;
}

/**
 * Get articles by topic ID
 */
export const useArticlesByTopic = (topicId: string): UseArticlesByTopicReturn => {
  const { articles, loading, error } = useSupportContent();
  
  const topicArticles = articles.filter(
    article => article.topicId === topicId
  );

  return { articles: topicArticles, loading, error };
};

export interface UseArticleReturn {
  article: SupportArticle | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Get single article by ID
 */
export const useArticle = (articleId: string): UseArticleReturn => {
  const { articles, loading, error } = useSupportContent();
  
  const article = articles.find(a => a.id === articleId);

  return { article, loading, error };
};

export interface UseSearchArticlesReturn {
  results: SupportArticle[];
  loading: boolean;
  error: string | null;
}

/**
 * Search articles
 */
export const useSearchArticles = (query: string): UseSearchArticlesReturn => {
  const { articles, loading, error } = useSupportContent();
  
  const searchResults = query
    ? articles.filter(article =>
        article.title.toLowerCase().includes(query.toLowerCase()) ||
        article.content.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  return { results: searchResults, loading, error };
};

export default useSupportContent;





