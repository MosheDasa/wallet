import { useEffect, useState } from "react";
import { BellOutlined, CheckCircleOutlined, DeleteOutlined, LinkOutlined, PlusOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Input, Select, Tag, Typography } from "antd";
import { WALLET_LOGO_URL } from "../branding";
import type { WalletCard, WalletTextField } from "../types";

const { Text } = Typography;

interface Props {
  cards: WalletCard[];
  fields: WalletTextField[];
  fieldsLoading: boolean;
  loading: boolean;
  busy: boolean;
  selectedObjectId?: string;
  onSelect: (objectId?: string) => void;
  onMessage: (header: string, body: string) => Promise<boolean>;
  onUpdate: (header: string, subheader: string) => Promise<boolean>;
  onFieldsChange: (fields: WalletTextField[]) => void;
  onSaveFields: (fields: WalletTextField[]) => Promise<boolean>;
  onMarkInvalid: () => Promise<boolean>;
  onMarkValid: () => Promise<boolean>;
  onRenewCar: (header: string) => Promise<boolean>;
}

export function WalletCardsPanel({
  cards, fields, fieldsLoading, loading, busy, selectedObjectId, onSelect, onMessage, onUpdate,
  onFieldsChange, onSaveFields, onMarkInvalid, onMarkValid, onRenewCar,
}: Props) {
  const [messageText, setMessageText] = useState("");
  const [messageHeader, setMessageHeader] = useState("");
  const [renewalHeader, setRenewalHeader] = useState("");
  const [newHeader, setNewHeader] = useState("");
  const selectedCard = cards.find((card) => card.objectId === selectedObjectId);
  const cardIsNotValid = (card: WalletCard) => card.isMarkedInvalid === true || card.state !== "ACTIVE";

  useEffect(() => {
    setMessageText("");
    setMessageHeader("");
    setRenewalHeader("");
  }, [selectedObjectId]);

  return (
    <Card className="simple-card" bordered={false} loading={loading}>
      <div className="panel-heading">
        <div className="step-number secondary-step">2</div>
        <div>
          <h2>ניהול כרטיס קיים</h2>
          <Text type="secondary">בחרו כרטיס ושלחו עדכון ישירות ל־Google Wallet</Text>
        </div>
        <Tag>{cards.length}</Tag>
      </div>

      {cards.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="עדיין לא הונפקו כרטיסים ללקוח הזה" />
      ) : (
        <>
          <div className="existing-card-select">
            <label htmlFor="existing-wallet-card">כרטיס קיים</label>
            <Select
              id="existing-wallet-card"
              value={selectedObjectId}
              onChange={(value) => onSelect(value)}
              options={cards.map((card) => ({ value: card.objectId, label: card.policyName }))}
              optionFilterProp="label"
              showSearch
              allowClear
              placeholder="בחרו כרטיס לניהול"
              optionRender={(option) => {
                const card = cards.find((item) => item.objectId === option.value);
                if (!card) return option.label;
                return (
                  <div className={"wallet-select-option" + (cardIsNotValid(card) ? " invalid" : " active")}>
                    <img src={WALLET_LOGO_URL} alt="" />
                    <span><strong>{card.policyName}</strong><small>{card.policyNumber} · {card.description}</small></span>
                    <Tag color={cardIsNotValid(card) ? "default" : "blue"}>
                      {card.isMarkedInvalid ? "לא בתוקף" : card.state === "ACTIVE" ? "פעיל" : "פג תוקף"}
                    </Tag>
                  </div>
                );
              }}
            />
          </div>

          {selectedCard && (
            <div className="card-actions">
              <div className="selected-card-title">
                <strong>{selectedCard.policyName}</strong>
                <Text type="secondary">{selectedCard.policyNumber}</Text>
              </div>
              <div className="action-field">
                <label htmlFor="wallet-message-header"><BellOutlined /> כותרת הודעת PUSH</label>
                <Input
                  id="wallet-message-header"
                  value={messageHeader}
                  onChange={(event) => setMessageHeader(event.target.value)}
                  placeholder="כותרת ההתראה"
                  maxLength={60}
                />
              </div>
              <div className="action-field">
                <label htmlFor="wallet-message">תוכן הודעת PUSH</label>
                <Input.TextArea
                  id="wallet-message"
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="הקלידו הודעה ללקוח"
                  maxLength={500}
                  rows={2}
                />
                <Button
                  icon={<SendOutlined />}
                  loading={busy}
                  disabled={!messageHeader.trim() || !messageText.trim()}
                  onClick={async () => {
                    if (await onMessage(messageHeader, messageText)) {
                      setMessageText("");
                      setMessageHeader("");
                    }
                  }}
                >
                  שליחת הודעה
                </Button>
              </div>

              <div className="action-field">
                <label htmlFor="wallet-header">עדכון נתון בכרטיס</label>
                <Input
                  id="wallet-header"
                  value={newHeader}
                  onChange={(event) => setNewHeader(event.target.value)}
                  placeholder="כותרת חדשה"
                  maxLength={80}
                />
                <Button
                  loading={busy}
                  disabled={!newHeader.trim()}
                  onClick={async () => { if (await onUpdate(newHeader, "")) setNewHeader(""); }}
                >
                  עדכון
                </Button>
              </div>

              <section className="wallet-custom-fields">
                <div className="custom-fields-heading">
                  <div>
                    <strong>שדות בכרטיס</strong>
                    <Text type="secondary">ערכו שדה קיים או הוסיפו שדה שיופיע בפרטי הפוליסה</Text>
                  </div>
                  <Button
                    icon={<PlusOutlined />}
                    disabled={fieldsLoading || busy || fields.length >= 10}
                    onClick={() => onFieldsChange([
                      ...fields,
                      { id: "field_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16), header: "", body: "" },
                    ])}
                  >
                    הוספת שדה
                  </Button>
                </div>
                {fieldsLoading ? (
                  <Text type="secondary">טוען שדות מ־Google Wallet…</Text>
                ) : fields.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="אין שדות בכרטיס עדיין" />
                ) : (
                  <div className="wallet-field-list">
                    {fields.map((field, index) => (
                      <div className="wallet-field-row" key={field.id}>
                        <Input
                          aria-label={"שם שדה " + (index + 1)}
                          value={field.header}
                          placeholder="שם השדה"
                          maxLength={60}
                          onChange={(event) => onFieldsChange(fields.map((item) =>
                            item.id === field.id ? { ...item, header: event.target.value } : item))}
                        />
                        <Input.TextArea
                          aria-label={"ערך שדה " + (index + 1)}
                          value={field.body}
                          placeholder="ערך השדה"
                          maxLength={500}
                          autoSize={{ minRows: 1, maxRows: 3 }}
                          onChange={(event) => onFieldsChange(fields.map((item) =>
                            item.id === field.id ? { ...item, body: event.target.value } : item))}
                        />
                        <Button
                          danger
                          aria-label="מחיקת שדה"
                          icon={<DeleteOutlined />}
                          disabled={busy}
                          onClick={async () => {
                            const nextFields = fields.filter((item) => item.id !== field.id);
                            onFieldsChange(nextFields);
                            if (!await onSaveFields(nextFields)) onFieldsChange(fields);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  type="primary"
                  loading={busy}
                  disabled={fieldsLoading || fields.some((field) => !field.header.trim() || !field.body.trim())}
                  onClick={() => onSaveFields(fields)}
                >
                  שמירת שדות בכרטיס
                </Button>
              </section>

              <div className="card-action-buttons">
                {selectedCard.policyType === "auto" && (
                  <div className="renewal-editor">
                    <label htmlFor="renewal-message-header"><LinkOutlined /> כותרת התראת חידוש</label>
                    <Input
                      id="renewal-message-header"
                      value={renewalHeader}
                      onChange={(event) => setRenewalHeader(event.target.value)}
                      placeholder="כותרת ההתראה"
                      maxLength={60}
                    />
                    <Text type="secondary">תוכן קבוע: זמן לחדש את הרכב</Text>
                    <Button
                      icon={<LinkOutlined />}
                      loading={busy}
                      disabled={!renewalHeader.trim()}
                      onClick={() => onRenewCar(renewalHeader)}
                    >
                      שליחת תזכורת חידוש
                    </Button>
                  </div>
                )}
                {cardIsNotValid(selectedCard) ? (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    loading={busy}
                    onClick={onMarkValid}
                  >
                    הפוך לפעיל
                  </Button>
                ) : (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    loading={busy}
                    onClick={onMarkInvalid}
                  >
                    סימון כלא בתוקף
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
