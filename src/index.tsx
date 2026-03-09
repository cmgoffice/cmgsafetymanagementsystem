import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { AppRouter } from "./AppRouter";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("App error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "2rem", fontFamily: "sans-serif", maxWidth: "600px", margin: "2rem auto" }}>
          <h1 style={{ color: "#b91c1c" }}>เกิดข้อผิดพลาด</h1>
          <p>{this.state.message}</p>
          <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
            กรุณาตรวจสอบ Console (F12) และตรวจสอบว่าไฟล์ .env มีค่า REACT_APP_FIREBASE_* ครบ แล้ว restart (npm start)
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById("root")!;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppRouter />
    </ErrorBoundary>
  </React.StrictMode>
);
