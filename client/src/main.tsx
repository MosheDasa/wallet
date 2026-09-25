import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import heIL from "antd/locale/he_IL";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      direction="rtl"
      locale={heIL}
      theme={{
        token: {
          colorPrimary: "#1767ab",
          colorInfo: "#4073a8",
          colorSuccess: "#35856f",
          borderRadius: 10,
          fontFamily: "Heebo, Arial, 'Noto Sans Hebrew', sans-serif",
          controlHeight: 42,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
