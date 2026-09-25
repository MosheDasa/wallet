import { useEffect, useState } from "react";
import { SafetyCertificateFilled, WalletOutlined } from "@ant-design/icons";
import { Alert, Button, Select, Space, Spin, Tag, Typography, message } from "antd";
import { api } from "./api";
import { CustomerPolicyPanel } from "./components/CustomerPolicyPanel";
import { WalletCardsPanel } from "./components/WalletCardsPanel";
import type { Customer, IssueResult, Policy, WalletCard } from "./types";

const { Text } = Typography;

function App() {
  const [toast, contextHolder] = message.useMessage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [cards, setCards] = useState<WalletCard[]>([]);
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string>();
  const [issueResult, setIssueResult] = useState<IssueResult>();
  const [walletReady, setWalletReady] = useState(false);
  const [walletMessage, setWalletMessage] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string>();

  const customer = customers.find((item) => item.id === selectedCustomerId);

  useEffect(() => {
    let active = true;
    Promise.all([api.customers(), api.health()])
      .then(([customerList, health]) => {
        if (!active) return;
        setCustomers(customerList);
        setSelectedCustomerId(customerList[0]?.id);
        setWalletReady(health.walletReady);
        setWalletMessage(health.walletMessage);
      })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) return;
    let active = true;
    setCustomerLoading(true);
    setPolicies([]);
    setCards([]);
    setSelectedPolicyIds([]);
    setSelectedObjectId(undefined);
    setIssueResult(undefined);
    Promise.all([api.policies(selectedCustomerId), api.cards(selectedCustomerId)])
      .then(([nextPolicies, nextCards]) => {
        if (!active) return;
        setPolicies(nextPolicies);
        setCards(nextCards);
        setSelectedObjectId(nextCards.find((card) => card.state === "ACTIVE")?.objectId ?? nextCards[0]?.objectId);
      })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setCustomerLoading(false); });
    return () => { active = false; };
  }, [selectedCustomerId]);

  const refreshCards = async (customerId = selectedCustomerId) => {
    if (!customerId) return;
    setCards(await api.cards(customerId));
  };

  const handleIssue = async () => {
    if (!selectedCustomerId || !selectedPolicyIds.length || !walletReady) return;
    const walletTab = window.open("about:blank", "_blank");
    if (walletTab) walletTab.opener = null;
    setIssuing(true);
    setError(undefined);
    try {
      const result = await api.issue(selectedCustomerId, selectedPolicyIds);
      setIssueResult(result);
      setSelectedPolicyIds([]);
      if (walletTab) walletTab.location.href = result.saveUrl;
      try {
        await refreshCards(selectedCustomerId);
        setSelectedObjectId(result.cards[0]?.objectId);
      } catch {
        setError("Google יצר את הכרטיסים, אך רענון הרשימה נכשל. קישור השמירה זמין למעלה.");
      }
      toast.success("נוצר קישור אמיתי לשמירה ב־Google Wallet");
    } catch (cause) {
      walletTab?.close();
      const errorMessage = cause instanceof Error ? cause.message : "לא ניתן היה להנפיק את הכרטיסים.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIssuing(false);
    }
  };

  const withAction = async (action: () => Promise<void>, successMessage: string) => {
    setActionBusy(true);
    setError(undefined);
    try {
      await action();
      toast.success(successMessage);
      try {
        await refreshCards();
      } catch {
        setError("הפעולה הושלמה ב־Google Wallet, אך לא ניתן היה לרענן את רשימת הכרטיסים.");
      }
      return true;
    } catch (cause) {
      const errorMessage = cause instanceof Error ? cause.message : "הפעולה נכשלה.";
      setError(errorMessage);
      toast.error(errorMessage);
      return false;
    } finally {
      setActionBusy(false);
    }
  };

  const handleMessage = (body: string) => withAction(
    async () => { if (selectedObjectId) await api.sendMessage(selectedObjectId, body); },
    "הודעת Wallet נשלחה",
  );

  const handleUpdate = (header: string, subheader: string) => withAction(
    async () => { if (selectedObjectId) await api.updateCard(selectedObjectId, header, subheader); },
    "הכרטיס עודכן",
  );

  const handleMarkInvalid = () => withAction(
    async () => { if (selectedObjectId) await api.markCardNotValid(selectedObjectId); },
    "הכרטיס נשאר בארנק וסומן כלא בתוקף",
  );

  const handleRenewCar = () => withAction(
    async () => { if (selectedObjectId) await api.renewCar(selectedObjectId); },
    "נשלחה תזכורת החידוש וקישור הכרטיס עודכן",
  );

  return (
    <main className="app-page" dir="rtl">
      {contextHolder}
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon"><SafetyCertificateFilled /></span>
          <div><strong>ביטוח ישיר</strong><small>ניהול כרטיסי Google Wallet</small></div>
        </div>
        <Tag color={walletReady ? "green" : "red"}>
          {walletReady ? "Google Wallet מחובר" : "Google Wallet לא זמין"}
        </Tag>
      </header>

      <section className="page-intro">
        <div>
          <h1>כרטיסי לקוחות</h1>
          <p>בחרו לקוח ופוליסות, או עדכנו כרטיס שכבר הונפק.</p>
        </div>
        <div className="customer-picker">
          <label htmlFor="customer-select">לקוח</label>
          <Select
            id="customer-select"
            showSearch
            optionFilterProp="label"
            value={selectedCustomerId}
            onChange={(value) => setSelectedCustomerId(value)}
            placeholder="בחירת לקוח"
            options={customers.map((item) => ({ value: item.id, label: item.name }))}
            disabled={loading || customers.length === 0}
          />
        </div>
      </section>

      {!walletReady && !loading && (
        <Alert
          className="setup-alert"
          type="error"
          showIcon
          message="חיבור Google Wallet לא הושלם"
          description={walletMessage ?? "לא ניתן לאמת חיבור אל Google Wallet API."}
        />
      )}
      {error && <Alert className="setup-alert" type="error" showIcon message={error} closable onClose={() => setError(undefined)} />}

      {issueResult && (
        <Alert
          className="save-result"
          type="success"
          showIcon
          message="הכרטיסים נוצרו ב־Google Wallet"
          description={
            <div className="save-result-content">
              <span>{issueResult.cards.length} כרטיסים מקובצים ללקוח {customer?.name}. יש להשלים את השמירה בדף Google שנפתח.</span>
              <Button type="link" href={issueResult.saveUrl} target="_blank" rel="noreferrer">פתיחת קישור השמירה</Button>
            </div>
          }
        />
      )}

      {loading ? (
        <div className="page-loading"><Spin size="large" /></div>
      ) : (
        <div className="main-grid">
          <CustomerPolicyPanel
            customer={customer}
            policies={policies}
            selectedIds={selectedPolicyIds}
            loading={customerLoading}
            issuing={issuing}
            walletReady={walletReady}
            onSelectionChange={setSelectedPolicyIds}
            onIssue={handleIssue}
          />
          <WalletCardsPanel
            cards={cards}
            loading={customerLoading}
            busy={actionBusy}
            selectedObjectId={selectedObjectId}
            onSelect={setSelectedObjectId}
            onMessage={handleMessage}
            onUpdate={handleUpdate}
            onMarkInvalid={handleMarkInvalid}
            onRenewCar={handleRenewCar}
          />
        </div>
      )}

      <footer className="page-footer">
        <Space><WalletOutlined /><Text type="secondary">ההנפקה והעדכונים מתבצעים דרך שרת Google Wallet API</Text></Space>
      </footer>
    </main>
  );
}

export default App;
