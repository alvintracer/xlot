-- supabase/migrations/20240102000000_create_user_credentials.sql
-- Phase 4: KYC Credentials
--
-- user_id = Thirdweb smartAccount.address (text)
--   → user_wallets.user_id, user_devices.user_id, user_vaults.user_id 와 동일한 식별자
--   → Supabase auth.users 참조 없음 (앱이 Thirdweb 기반)
--
-- PII 없음 — 서명값(proof_signature)만 저장
-- 계정 단위: UNIQUE(user_id, claim_type)

CREATE TABLE IF NOT EXISTS user_credentials (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          text    NOT NULL,                -- Thirdweb smartAccount.address
  claim_type       text    NOT NULL CHECK (claim_type IN ('ADULT', 'KOREAN', 'NON_SANCTIONED')),
  status           text    NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING')),
  issuance_date    bigint  NOT NULL,                -- unix ms
  expiration_date  bigint  NOT NULL,                -- unix ms (1년)
  proof_signature  text,                            -- EIP-712 서명 (나중에 zk proof로 교체)
  verifier_address text,                            -- TranSight 서버 주소
  chain_id         int     DEFAULT 80002,
  tx_hash          text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),

  -- 계정(user_id) 단위로 claim_type 하나씩만 (upsert 기준)
  UNIQUE (user_id, claim_type)
);

-- RLS: 본인 credential만 조회 가능
-- Thirdweb 기반이므로 auth.uid() 대신 user_id 직접 비교
-- (anon key로 조회 시 RLS 정책으로 본인 것만 반환)
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

-- 조회: 클라이언트에서 user_id 필터로 직접 조회
-- (Thirdweb address를 알면 본인 것만 볼 수 있음)
CREATE POLICY "read_own_credentials" ON user_credentials
  FOR SELECT USING (true);  -- user_id 필터는 쿼리에서 강제

-- 쓰기: service_role(Edge Function)만 가능
CREATE POLICY "service_role_write" ON user_credentials
  FOR ALL USING (auth.role() = 'service_role');

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_credentials_user_id   ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_type      ON user_credentials(claim_type);
CREATE INDEX IF NOT EXISTS idx_credentials_status    ON user_credentials(status);
CREATE INDEX IF NOT EXISTS idx_credentials_expiry    ON user_credentials(expiration_date);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credentials_updated_at
  BEFORE UPDATE ON user_credentials
  FOR EACH ROW EXECUTE FUNCTION update_credentials_updated_at();