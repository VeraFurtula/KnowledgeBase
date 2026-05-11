import { Navigate, Route, Routes } from "react-router-dom";
import { ChatPage } from "./pages/ChatPage";
import { ChatRedirect } from "./pages/ChatRedirect";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./routing/RequireAuth";
import styles from "./App.module.css";

export default function App() {
  return (
    <div className={styles.root}>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/chat" element={<ChatRedirect />} />
        <Route path="/chat/:chatId" element={<ChatPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </div>
  );
}
