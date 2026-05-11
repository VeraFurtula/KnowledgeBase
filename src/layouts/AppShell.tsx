import { ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { IconMenu } from "../components/Icons";
import { Sidebar } from "../components/Sidebar";
import { FAVICON_PNG } from "../brand";
import styles from "./AppShell.module.css";

type Props = {
  children: ReactNode;
  /** When false, no sidebar (e.g. login page full bleed) */
  showSidebar?: boolean;
  title?: string;
};

export function AppShell({ children, showSidebar = true, title = "Knowledge Base" }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const showLoginLink = pathname !== "/login" && !user;

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className={styles.page}>
      {showSidebar && (
        <>
          <div
            className={`${styles.scrim} ${drawerOpen ? styles.scrimOn : ""}`}
            aria-hidden={!drawerOpen}
            onClick={() => setDrawerOpen(false)}
          />
          <div className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : ""}`}>
            <Sidebar onClose={() => setDrawerOpen(false)} />
          </div>
        </>
      )}

      <div className={styles.mainWrap}>
        {showSidebar && (
          <div className={styles.sidebarDesktop}>
            <Sidebar />
          </div>
        )}
        <div className={styles.main}>
          <header className={styles.header}>
            <Link to="/" className={styles.brand}>
              <img src={FAVICON_PNG} alt="" className={styles.brandIcon} aria-hidden />
              <span className={styles.brandText}>{title}</span>
            </Link>
            <div className={styles.headerRight}>
              {user && (
                <span className={styles.userHint} title={user.email}>
                  {user.email.split("@")[0]}
                </span>
              )}
              {showLoginLink && (
                <Link to="/login" className={styles.loginLink}>
                  Login
                </Link>
              )}
              {user && pathname !== "/login" && (
                <button type="button" className={styles.logoutLink} onClick={handleLogout}>
                  Log out
                </button>
              )}
              {showSidebar && (
                <button
                  type="button"
                  className={styles.menuBtn}
                  aria-label="Open menu"
                  onClick={() => setDrawerOpen(true)}
                >
                  <IconMenu />
                </button>
              )}
              {!showSidebar && (
                <button type="button" className={styles.menuBtn} aria-label="Menu">
                  <IconMenu />
                </button>
              )}
            </div>
          </header>
          <div className={styles.mainBody}>{children}</div>
        </div>
      </div>
    </div>
  );
}
