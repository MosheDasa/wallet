import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Select, Tag, Typography } from "antd";
import type { Customer, Policy } from "../types";

const { Text } = Typography;
const SELECT_ALL = "__select_all_policies__";

interface Props {
  customers: Customer[];
  customer?: Customer;
  selectedCustomerId?: string;
  onCustomerChange: (customerId: string) => void;
  policies: Policy[];
  selectedIds: string[];
  loading: boolean;
  issuing: boolean;
  walletReady: boolean;
  onSelectionChange: (ids: string[]) => void;
  onIssue: () => void;
}

export function CustomerPolicyPanel({
  customers, customer, selectedCustomerId, onCustomerChange, policies, selectedIds, loading, issuing,
  walletReady, onSelectionChange, onIssue,
}: Props) {
  const handleSelectionChange = (values: string[]) => {
    if (values.includes(SELECT_ALL)) {
      onSelectionChange(selectedIds.length === policies.length ? [] : policies.map((policy) => policy.id));
      return;
    }
    onSelectionChange(values.filter((value) => value !== SELECT_ALL));
  };

  const allSelected = policies.length > 0 && selectedIds.length === policies.length;

  return (
    <Card className="simple-card" bordered={false} loading={loading}>
      <div className="panel-heading">
        <div className="step-number">1</div>
        <div>
          <h2>בחרו פוליסות</h2>
        </div>
        <Tag>{policies.length}</Tag>
      </div>

      <div className="panel-customer-picker">
        <label htmlFor="customer-select">לקוח</label>
        <Select
          id="customer-select"
          showSearch
          optionFilterProp="label"
          value={selectedCustomerId}
          onChange={onCustomerChange}
          placeholder="בחירת לקוח"
          options={customers.map((item) => ({ value: item.id, label: item.name }))}
          optionRender={(option) => {
            const item = customers.find((candidate) => candidate.id === option.value);
            return item ? <div className="customer-option"><strong>{item.name}</strong><small>{item.email}</small></div> : option.label;
          }}
          disabled={customers.length === 0}
        />
      </div>

      {!customer ? (
        <Empty description="בחרו לקוח כדי לראות את הפוליסות שלו" />
      ) : policies.length === 0 ? (
        <Empty description="לא נמצאו פוליסות ללקוח" />
      ) : (
        <div className="policy-select-control">
          <label htmlFor="policy-select">פוליסות להנפקה</label>
          <Select
            id="policy-select"
            mode="multiple"
            showSearch
            allowClear
            optionFilterProp="label"
            maxTagCount="responsive"
            value={selectedIds}
            onChange={handleSelectionChange}
            placeholder="בחרו פוליסות"
            options={[
              { value: SELECT_ALL, label: allSelected ? "ביטול בחירת כל הפוליסות" : "בחירת כל הפוליסות" },
              ...policies.map((policy) => ({ value: policy.id, label: policy.label })),
            ]}
            optionRender={(option) => {
              if (option.value === SELECT_ALL) {
                return <strong className="select-all-option">{allSelected ? "ביטול בחירת כל הפוליסות" : "בחירת כל הפוליסות"}</strong>;
              }
              const policy = policies.find((item) => item.id === option.value);
              if (!policy) return option.label;
              return (
                <div className="policy-select-option">
                  <span><strong>{policy.label}</strong><small>{policy.description}</small></span>
                  <Tag color={policy.status === "active" ? "blue" : "gold"}>
                    {policy.status === "active" ? "פעילה" : "בטיפול"}
                  </Tag>
                </div>
              );
            }}
          />
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
