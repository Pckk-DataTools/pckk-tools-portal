type PortalHeaderProps = {
  email: string;
  userId: string;
  role: "admin" | "user";
  loading: boolean;
  onReload: () => void;
  onLogout: () => void;
};

export function PortalHeader({ email, userId, role, loading, onReload, onLogout }: PortalHeaderProps) {
  return (
    <header className="portal-header">
      <div>
        <p className="portal-eyebrow">PCKK Tools Portal</p>
        <h1>社内業務改善ツール配布ポータルサイト</h1>
      </div>
      <div className="portal-userbox">
        <div className="portal-user-meta">
          <strong>{email}</strong>
          <span>{userId}</span>
          <span>role: {role}</span>
        </div>
        <div className="portal-actions">
          <button className="button-secondary" disabled={loading} onClick={onReload}>
            再読み込み
          </button>
          <button className="button-danger" onClick={onLogout}>
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
