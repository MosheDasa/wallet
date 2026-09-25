import { useEffect, useState } from "react";
import { WalletOutlined } from "@ant-design/icons";
import { Alert, Button, Select, Space, Spin, Typography, message } from "antd";
import { api } from "./api";
import { CustomerPolicyPanel } from "./components/CustomerPolicyPanel";
import { WalletCardsPanel } from "./components/WalletCardsPanel";
import type { Customer, IssueResult, Policy, WalletCard, WalletLinkType, WalletTextField } from "./types";

const { Text } = Typography;

function App() {
  const [toast, contextHolder] = message.useMessage();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [cards, setCards] = useState<WalletCard[]>([]);
  const [cardFields, setCardFields] = useState<WalletTextField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
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

  useEffect(() => {
    if (!selectedObjectId) {
      setCardFields([]);
      setFieldsLoading(false);
      return;
    }
    let active = true;
    setFieldsLoading(true);
    api.fields(selectedObjectId)
      .then(({ fields }) => { if (active) setCardFields(fields); })
      .catch((cause: Error) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setFieldsLoading(false); });
    return () => { active = false; };
  }, [selectedObjectId]);

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

  const handleMessage = (header: string, body: string) => withAction(
    async () => { if (selectedObjectId) await api.sendMessage(selectedObjectId, header, body); },
    "הודעת Wallet נשלחה",
  );

  const handleDeleteMessage = (messageIndex: number) => withAction(
    async () => { if (selectedObjectId) await api.deleteMessage(selectedObjectId, messageIndex); },
    "ההודעה הוסרה מהכרטיס",
  );

  const handleAddWalletLink = (description: string, linkType: WalletLinkType, value: string) => withAction(
    async () => { if (selectedObjectId) await api.addWalletLink(selectedObjectId, description, linkType, value); },
    "הקישור נוסף לכרטיס Google Wallet",
  );

  const handleDeleteWalletLink = (linkIndex: number) => withAction(
    async () => { if (selectedObjectId) await api.deleteWalletLink(selectedObjectId, linkIndex); },
    "הקישור הוסר מהכרטיס",
  );

  const handleDeleteAllWalletLinks = () => withAction(
    async () => { if (selectedObjectId) await api.deleteAllWalletLinks(selectedObjectId); },
    "כל הקישורים הוסרו מהכרטיס",
  );

  const handleMoveWalletLink = (fromIndex: number, toIndex: number) => withAction(
    async () => { if (selectedObjectId) await api.moveWalletLink(selectedObjectId, fromIndex, toIndex); },
    "סדר הקישורים עודכן בכרטיס",
  );

  const handleUpdate = (header: string, subheader: string) => withAction(
    async () => { if (selectedObjectId) await api.updateCard(selectedObjectId, header, subheader); },
    "הכרטיס עודכן",
  );

  const handleSaveFields = (fields: WalletTextField[]) => withAction(
    async () => {
      if (!selectedObjectId) return;
      const result = await api.updateFields(selectedObjectId, fields);
      setCardFields(result.fields);
    },
    "השדות עודכנו בכרטיס Google Wallet",
  );

  const handleMarkInvalid = () => withAction(
    async () => {
      if (!selectedObjectId) return;
      await api.markCardNotValid(selectedObjectId);
      setCardFields((fields) => fields.some((field) => field.id === "policy-status")
        ? fields.map((field) => field.id === "policy-status"
          ? { ...field, header: "סטטוס הפוליסה", body: "לא בתוקף" }
          : field)
        : [...fields, { id: "policy-status", header: "סטטוס הפוליסה", body: "לא בתוקף" }]);
    },
    "הכרטיס נשאר בארנק וסומן כלא בתוקף",
  );

  const handleMarkValid = () => withAction(
    async () => {
      if (!selectedObjectId) return;
      await api.markCardValid(selectedObjectId);
      setCardFields((fields) => fields.filter((field) => field.id !== "policy-status"));
    },
    "הכרטיס הופעל והוחזר לצבע כחול",
  );

  const handleRenewCar = (header: string) => withAction(
    async () => { if (selectedObjectId) await api.renewCar(selectedObjectId, header); },
    "נשלחה תזכורת החידוש וקישור הכרטיס עודכן",
  );

  return (
    <main className="app-page" dir="rtl">
      {contextHolder}
      <div className="page-title"><WalletOutlined /><h1>מערכת ארנק דיגיטלית</h1></div>
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
            customers={customers}
            customer={customer}
            selectedCustomerId={selectedCustomerId}
            onCustomerChange={setSelectedCustomerId}
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
            fields={cardFields}
            fieldsLoading={fieldsLoading}
            loading={customerLoading}
            busy={actionBusy}
            selectedObjectId={selectedObjectId}
            onSelect={setSelectedObjectId}
            onMessage={handleMessage}
            onDeleteMessage={handleDeleteMessage}
            onAddWalletLink={handleAddWalletLink}
            onDeleteWalletLink={handleDeleteWalletLink}
            onDeleteAllWalletLinks={handleDeleteAllWalletLinks}
            onMoveWalletLink={handleMoveWalletLink}
            onUpdate={handleUpdate}
            onFieldsChange={setCardFields}
            onSaveFields={handleSaveFields}
            onMarkInvalid={handleMarkInvalid}
            onMarkValid={handleMarkValid}
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
