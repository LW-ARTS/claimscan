export type Platform = 'bags' | 'clanker' | 'pump' | 'zora' | 'heaven' | 'bankr' | 'believe' | 'revshare';
export type Chain = 'sol' | 'base' | 'eth';
export type IdentityProvider = 'twitter' | 'github' | 'farcaster' | 'wallet';
export type ClaimStatus = 'claimed' | 'unclaimed' | 'auto_distributed';

export interface Database {
  public: {
    Tables: {
      creators: {
        Row: {
          id: string;
          twitter_handle: string | null;
          github_handle: string | null;
          farcaster_handle: string | null;
          farcaster_fid: number | null;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          twitter_handle?: string | null;
          github_handle?: string | null;
          farcaster_handle?: string | null;
          farcaster_fid?: number | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          twitter_handle?: string | null;
          github_handle?: string | null;
          farcaster_handle?: string | null;
          farcaster_fid?: number | null;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      wallets: {
        Row: {
          id: string;
          creator_id: string;
          address: string;
          chain: Chain;
          source_platform: Platform;
          verified: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          address: string;
          chain: Chain;
          source_platform: Platform;
          verified?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          address?: string;
          chain?: Chain;
          source_platform?: Platform;
          verified?: boolean;
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: 'wallets_creator_id_fkey'; columns: ['creator_id']; referencedRelation: 'creators'; referencedColumns: ['id'] }];
      };
      creator_tokens: {
        Row: {
          id: string;
          creator_id: string;
          platform: Platform;
          chain: Chain;
          token_address: string;
          token_symbol: string | null;
          token_name: string | null;
          token_image_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          platform: Platform;
          chain: Chain;
          token_address: string;
          token_symbol?: string | null;
          token_name?: string | null;
          token_image_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          platform?: Platform;
          chain?: Chain;
          token_address?: string;
          token_symbol?: string | null;
          token_name?: string | null;
          token_image_url?: string | null;
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: 'creator_tokens_creator_id_fkey'; columns: ['creator_id']; referencedRelation: 'creators'; referencedColumns: ['id'] }];
      };
      fee_records: {
        Row: {
          id: string;
          creator_id: string;
          creator_token_id: string | null;
          platform: Platform;
          chain: Chain;
          token_address: string;
          token_symbol: string | null;
          total_earned: string;
          total_claimed: string;
          total_unclaimed: string;
          total_earned_usd: number | null;
          claim_status: ClaimStatus;
          royalty_bps: number | null;
          last_synced_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          creator_token_id?: string | null;
          platform: Platform;
          chain: Chain;
          token_address: string;
          token_symbol?: string | null;
          total_earned: string;
          total_claimed: string;
          total_unclaimed: string;
          total_earned_usd?: number | null;
          claim_status: ClaimStatus;
          royalty_bps?: number | null;
          last_synced_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          creator_token_id?: string | null;
          platform?: Platform;
          chain?: Chain;
          token_address?: string;
          token_symbol?: string | null;
          total_earned?: string;
          total_claimed?: string;
          total_unclaimed?: string;
          total_earned_usd?: number | null;
          claim_status?: ClaimStatus;
          royalty_bps?: number | null;
          last_synced_at?: string;
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: 'fee_records_creator_id_fkey'; columns: ['creator_id']; referencedRelation: 'creators'; referencedColumns: ['id'] }];
      };
      claim_events: {
        Row: {
          id: string;
          creator_id: string;
          platform: Platform;
          chain: Chain;
          token_address: string;
          amount: string;
          amount_usd: number | null;
          tx_hash: string | null;
          claimed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          platform: Platform;
          chain: Chain;
          token_address: string;
          amount: string;
          amount_usd?: number | null;
          tx_hash?: string | null;
          claimed_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          platform?: Platform;
          chain?: Chain;
          token_address?: string;
          amount?: string;
          amount_usd?: number | null;
          tx_hash?: string | null;
          claimed_at?: string;
          created_at?: string;
        };
        Relationships: [{ foreignKeyName: 'claim_events_creator_id_fkey'; columns: ['creator_id']; referencedRelation: 'creators'; referencedColumns: ['id'] }];
      };
      token_prices: {
        Row: {
          id: string;
          chain: Chain;
          token_address: string;
          token_symbol: string;
          price_usd: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          chain: Chain;
          token_address: string;
          token_symbol: string;
          price_usd: number;
          updated_at: string;
        };
        Update: {
          id?: string;
          chain?: Chain;
          token_address?: string;
          token_symbol?: string;
          price_usd?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      search_log: {
        Row: {
          id: string;
          query: string;
          provider: IdentityProvider;
          creator_id: string | null;
          ip_hash: string | null;
          searched_at: string;
        };
        Insert: {
          id?: string;
          query: string;
          provider: IdentityProvider;
          creator_id?: string | null;
          ip_hash?: string | null;
          searched_at?: string;
        };
        Update: {
          id?: string;
          query?: string;
          provider?: IdentityProvider;
          creator_id?: string | null;
          ip_hash?: string | null;
          searched_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      creator_fee_summary: {
        Row: {
          creator_id: string;
          twitter_handle: string | null;
          github_handle: string | null;
          display_name: string | null;
          platform: Platform;
          chain: Chain;
          token_count: number;
          total_earned_usd: number | null;
          has_unclaimed: boolean;
          last_synced_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      platform_type: Platform;
      chain_type: Chain;
      identity_provider: IdentityProvider;
      claim_status: ClaimStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
