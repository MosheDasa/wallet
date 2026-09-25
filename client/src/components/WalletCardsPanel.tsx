import { useState } from "react";
import { BellOutlined, LinkOutlined, SendOutlined, StopOutlined } from "@ant-design/icons";
import { Button, Card, Empty, Input, Tag, Typography } from "antd";
import type { WalletCard } from "../types";

const { Text } = Typography;

interface Props {
  cards: WalletCard[];
  loading: boolean;
  busy: boolean;
  selectedObjectId?: string;
  onSelect: (objectId: string) => void;
  onMessage: (body: string) => Promise<boolean>;
  onUpdate: (header: string, subheader: string) => Promise<boolean>;
  onMarkInvalid: () => Promise<boolean>;
  onRenewCar: () => Promise<boolean>;
}

export function WalletCardsPanel({
  cards, loading, busy, selectedObjectId, onSelect, onMessage, onUpdate, onMarkInvalid, onRenewCar,
}: Props) {
  const [messageText, setMessageText] = useState("");
  const [newHeader, setNewHeader] = useState("");
  const selectedCard = cards.find((card) => card.objectId === selectedObjectId);

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
          <div className="wallet-card-list">
            {cards.map((card) => (
              <button
                key={card.objectId}
                type="button"
                className={"wallet-row" + (selectedObjectId === card.objectId ? " selected" : "")}
                onClick={() => onSelect(card.objectId)}
              >
                <span className={"type-mark type-" + card.policyType}>{card.policyName.slice(0, 1)}</span>
                <span className="wallet-row-copy">
                  <strong>{card.policyName}</strong>
                  <small>{card.policyNumber} · {card.description}</small>
                </span>
                <Tag color={card.isMarkedInvalid ? "red" : card.state === "ACTIVE" ? "green" : "default"}>
                  {card.isMarkedInvalid ? "לא בתוקף" : card.state === "ACTIVE" ? "פעיל" : card.state === "EXPIRED" ? "פג תוקף" : card.state}
                </Tag>
              </button>
            ))}
          </div>

          {selectedCard && (
            <div className="card-actions">
              <div className="selected-card-title">
                <strong>{selectedCard.policyName}</strong>
                <Text type="secondary">{selectedCard.policyNumber}</Text>
              </div>
              <div className="action-field">
                <label htmlFor="wallet-message"><BellOutlined /> הודעת PUSH</label>
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
                  disabled={!messageText.trim()}
                  onClick={async () => { if (await onMessage(messageText)) setMessageText(""); }}
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

              <div className="card-action-buttons">
                {selectedCard.policyType === "auto" && (
                  <Button icon={<LinkOutlined />} loading={busy} onClick={onRenewCar}>
                    תזכורת חידוש רכב
                  </Button>
                )}
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={busy}
                  disabled={selectedCard.isMarkedInvalid === true}
                  onClick={onMarkInvalid}
                >
                  {selectedCard.isMarkedInvalid ? "סומן כלא בתוקף" : "סימון כלא בתוקף"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
