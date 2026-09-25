import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Card, Checkbox, Empty, Tag, Typography } from "antd";
import type { Customer, Policy } from "../types";

const { Text } = Typography;

interface Props {
  customer?: Customer;
  policies: Policy[];
  selectedIds: string[];
  loading: boolean;
  issuing: boolean;
  walletReady: boolean;
  onSelectionChange: (ids: string[]) => void;
  onIssue: () => void;
}

export function CustomerPolicyPanel({
  customer, policies, selectedIds, loading, issuing, walletReady, onSelectionChange, onIssue,
}: Props) {
  const togglePolicy = (policyId: string, checked: boolean) => {
    onSelectionChange(checked ? [...selectedIds, policyId] : selectedIds.filter((id) => id !== policyId));
  };

  return (
    <Card className="simple-card" bordered={false} loading={loading}>
      <div className="panel-heading">
        <div className="step-number">1</div>
        <div>
          <h2>בחרו פוליסות</h2>
          <Text type="secondary">הכרטיסים שתבחרו יישמרו יחד בארנק</Text>
        </div>
        <Tag>{policies.length}</Tag>
      </div>

      {customer && <div className="customer-line"><strong>{customer.name}</strong><span>{customer.email}</span></div>}

      {!customer ? (
        <Empty description="בחרו לקוח כדי לראות את הפוליסות שלו" />
      ) : policies.length === 0 ? (
        <Empty description="לא נמצאו פוליסות ללקוח" />
      ) : (
        <div className="policy-list">
          {policies.map((policy) => {
            const checked = selectedIds.includes(policy.id);
            return (
              <div className={"policy-row" + (checked ? " selected" : "")} key={policy.id}>
                <Checkbox
                  checked={checked}
                  onChange={(event) => togglePolicy(policy.id, event.target.checked)}
                  aria-label={"בחירת " + policy.label}
                />
                <button type="button" className="policy-label" onClick={() => togglePolicy(policy.id, !checked)}>
                  <strong>{policy.label}</strong>
                  <span>{policy.description}</span>
                  <small>{policy.policyNumber} · בתוקף עד {new Date(policy.validUntil).toLocaleDateString("he-IL")}</small>
                </button>
                <Tag color={policy.status === "active" ? "green" : "gold"}>
                  {policy.status === "active" ? "פעילה" : "בטיפול"}
                </Tag>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel-footer">
        <Text type="secondary">
          {selectedIds.length ? selectedIds.length + " נבחרו" : "סמנו פוליסה אחת או יותר"}
        </Text>
        <Button
          type="primary"
          size="large"
          icon={<ArrowLeftOutlined />}
          disabled={!customer || !walletReady || selectedIds.length === 0}
          loading={issuing}
          onClick={onIssue}
        >
          דחוף לארנק
        </Button>
      </div>
      {!walletReady && <Text type="danger" className="setup-hint">נדרש להגדיר חשבון שירות ו־Issuer ID כדי להנפיק.</Text>}
    </Card>
  );
}
