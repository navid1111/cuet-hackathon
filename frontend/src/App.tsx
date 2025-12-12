import "./App.css";
import { HealthCard } from "./components/HealthCard";
import { JobsList } from "./components/JobsList";
import { ErrorsList } from "./components/ErrorsList";

// Sentry test button
function ErrorButton() {
  return (
    <button
      onClick={() => {
        throw new Error("This is your first error!");
      }}
      style={{
        padding: "12px 28px",
        borderRadius: "12px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
        border: "none",
        background: "rgba(239, 68, 68, 0.15)",
        backdropFilter: "blur(10px)",
        color: "#ffffff",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: "0 4px 15px rgba(239, 68, 68, 0.2)",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.background = "rgba(239, 68, 68, 0.25)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(239, 68, 68, 0.3)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 15px rgba(239, 68, 68, 0.2)";
      }}
      title="Click to trigger a test error for Sentry"
    >
      🚨 Test Error
    </button>
  );
}

function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        padding: "40px 20px",
        position: "relative",
      }}
    >
      {/* Animated background overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(99, 102, 241, 0.3), transparent 50%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{ maxWidth: "1200px", margin: "0 auto", position: "relative" }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "48px",
            flexWrap: "wrap",
            gap: "20px",
          }}
        >
          <div>
            <h1
              style={{
                color: "#ffffff",
                fontSize: "36px",
                fontWeight: "800",
                margin: 0,
                marginBottom: "8px",
                textShadow: "0 2px 10px rgba(0,0,0,0.2)",
                letterSpacing: "-0.5px",
              }}
            >
              CUET Micro-Ops
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,0.9)",
                fontSize: "16px",
                margin: 0,
                fontWeight: "500",
              }}
            >
              Hackathon 2025 • Real-time Job Monitoring
            </p>
          </div>
          <ErrorButton />
        </div>

        {/* Main Content Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
            gap: "24px",
            marginBottom: "24px",
          }}
        >
          <HealthCard />
        </div>

        <JobsList />
        <ErrorsList />
      </div>
    </div>
  );
}

export default App;
