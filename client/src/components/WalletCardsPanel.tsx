import { useEffect, useState } from "react";
import { ArrowDownOutlined, ArrowUpOutlined, BellOutlined, CheckCircleOutlined, CodeOutlined, DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, SendOutlined, StopOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Input, Popconfirm, Select, Spin, Tabs, Tag, Tooltip, Typography } from "antd";
import { api } from "../api";
import { WALLET_LOGO_URL } from "../branding";
import type { WalletCard, WalletLinkType, WalletTextField } from "../types";

const { Text } = Typography;

interface GoogleWalletMessage {
  header?: string;
  body?: string;
  messageType?: string;
  id?: string;
}

interface GoogleWalletLink {
  description?: string;
  uri?: string;
  id?: string;
}

function isGoogleWalletMessage(value: unknown): value is GoogleWalletMessage {
  return Boolean(value && typeof value === "object");
}

function isGoogleWalletLink(value: unknown): value is GoogleWalletLink {
  return Boolean(value && typeof value === "object");
}

interface Props {
  cards: WalletCard[];
  fields: WalletTextField[];
  fieldsLoading: boolean;
  loading: boolean;
  busy: boolean;
  selectedObjectId?: string;
  onSelect: (objectId?: string) => void;
  onMessage: (header: string, body: string) => Promise<boolean>;
  onDeleteMessage: (messageIndex: number) => Promise<boolean>;
  onAddWalletLink: (description: string, linkType: WalletLinkType, value: string) => Promise<boolean>;
  onDeleteWalletLink: (linkIndex: number) => Promise<boolean>;
  onDeleteAllWalletLinks: () => Promise<boolean>;
  onMoveWalletLink: (fromIndex: number, toIndex: number) => Promise<boolean>;
  onUpdate: (header: string, subheader: string) => Promise<boolean>;
  onFieldsChange: (fields: WalletTextField[]) => void;
  onSaveFields: (fields: WalletTextField[]) => Promise<boolean>;
  onMarkInvalid: () => Promise<boolean>;
  onMarkValid: () => Promise<boolean>;
  onRenewCar: (header: string) => Promise<boolean>;
}

export function WalletCardsPanel({
  cards, fields, fieldsLoading, loading, busy, selectedObjectId, onSelect, onMessage, onDeleteMessage,
  onAddWalletLink, onDeleteWalletLink, onDeleteAllWalletLinks, onMoveWalletLink, onUpdate,
  onFieldsChange, onSaveFields, onMarkInvalid, onMarkValid, onRenewCar,
}: Props) {
  const [messageText, setMessageText] = useState("");
  const [messageHeader, setMessageHeader] = useState("");
  const [newHeader, setNewHeader] = useState("");
  const [activeTab, setActiveTab] = useState("notifications");
  const [googleObject, setGoogleObject] = useState<Record<string, unknown>>();
  const [googleDataLoading, setGoogleDataLoading] = useState(false);
  const [googleDataError, setGoogleDataError] = useState<string>();
  const [deletingMessageIndex, setDeletingMessageIndex] = useState<number>();
  const [deletingLinkIndex, setDeletingLinkIndex] = useState<number>();
  const [linkDescription, setLinkDescription] = useState("");
  const [linkType, setLinkType] = useState<WalletLinkType>("website");
  const [linkUri, setLinkUri] = useState("");
  const selectedCard = cards.find((card) => card.objectId === selectedObjectId);
  const cardIsNotValid = (card: WalletCard) => card.isMarkedInvalid === true || card.state !== "ACTIVE";
  const googleMessages = Array.isArray(googleObject?.messages)
    ? googleObject.messages.filter(isGoogleWalletMessage)
    : [];
  const linksModuleData = googleObject?.linksModuleData;
  const googleLinks = linksModuleData && typeof linksModuleData === "object" && "uris" in linksModuleData && Array.isArray(linksModuleData.uris)
    ? linksModuleData.uris.filter(isGoogleWalletLink)
    : [];

  useEffect(() => {
    setMessageText("");
    setMessageHeader("");
    setNewHeader("");
    setActiveTab("notifications");
    setGoogleObject(undefined);
    setGoogleDataError(undefined);
    setLinkDescription("");
    setLinkType("website");
    setLinkUri("");
  }, [selectedObjectId]);

  const loadGoogleData = async () => {
    if (!selectedObjectId) return;
    setGoogleDataLoading(true);
    setGoogleDataError(undefined);
    try {
      const response = await api.googleObject(selectedObjectId);
      setGoogleObject(response.object);
    } catch (cause) {
      setGoogleDataError(cause instanceof Error ? cause.message : "לא ניתן לטעון את נתוני הכרטיס מ־Google Wallet.");
    } finally {
      setGoogleDataLoading(false);
    }
  };

  const handleDeleteMessage = async (messageIndex: number) => {
    setDeletingMessageIndex(messageIndex);
    try {
      if (await onDeleteMessage(messageIndex)) await loadGoogleData();
    } finally {
      setDeletingMessageIndex(undefined);
    }
  };

  const handleAddLink = async () => {
    const description = linkDescription.trim();
    const value = linkUri.trim();
    if (!description || !value) return;
    if (await onAddWalletLink(description, linkType, value)) {
      setLinkDescription("");
      setLinkUri("");
      await loadGoogleData();
    }
  };

  const handleDeleteLink = async (linkIndex: number) => {
    setDeletingLinkIndex(linkIndex);
    try {
      if (await onDeleteWalletLink(linkIndex)) await loadGoogleData();
    } finally {
      setDeletingLinkIndex(undefined);
    }
  };

  const handleMoveLink = async (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= googleLinks.length) return;
    if (await onMoveWalletLink(fromIndex, toIndex)) await loadGoogleData();
  };

  return (
    <Card className="simple-card" bordered={false} loading={loading}>
      <div className="panel-heading">
        <div className="step-number secondary-step">2</div>
        <div>
          <h2>ניהול כרטיס קיים</h2>
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
              <Tabs
                className="wallet-action-tabs"
                activeKey={activeTab}
                onChange={(key) => {
                  setActiveTab(key);
                  if (key === "google-data" || key === "links" || key === "actions") void loadGoogleData();
                }}
                items={[
                  {
                    key: "notifications",
                    label: <span className="wallet-tab-label"><BellOutlined /> התראות</span>,
                    children: (
                      <div className="tab-content">
                        <section className="action-section">
                          <div className="action-section-heading">
                            <BellOutlined />
                            <div><strong>שליחת הודעה ללקוח</strong></div>
                          </div>
                          <div className="action-field">
                            <label htmlFor="wallet-message-header">כותרת הודעת PUSH</label>
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
                              rows={3}
                            />
                            <Button
                              type="primary"
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
                        {selectedCard.policyType === "auto" && (
                          <div className="renewal-editor">
                            <Text type="secondary">תוכן ההודעה: זמן לחדש את הרכב</Text>
                            <Button
                              icon={<LinkOutlined />}
                              loading={busy}
                              disabled={!messageHeader.trim()}
                              onClick={() => onRenewCar(messageHeader)}
                            >
                              שליחת תזכורת וקישור לחידוש
                            </Button>
                          </div>
                        )}
                        </section>
                      </div>
                    ),
                  },
                  {
                    key: "details",
                    label: <span className="wallet-tab-label"><EditOutlined /> פרטי הכרטיס</span>,
                    children: (
                      <div className="tab-content">
                        <section className="action-section">
                          <div className="action-section-heading">
                            <EditOutlined />
                            <div><strong>עדכון כותרת הכרטיס</strong></div>
                          </div>
                          <div className="action-field">
                            <label htmlFor="wallet-header">כותרת חדשה</label>
                            <Input
                              id="wallet-header"
                              value={newHeader}
                              onChange={(event) => setNewHeader(event.target.value)}
                              placeholder="הקלידו כותרת"
                              maxLength={80}
                            />
                            <Button
                              loading={busy}
                              disabled={!newHeader.trim()}
                              onClick={async () => { if (await onUpdate(newHeader, "")) setNewHeader(""); }}
                            >
                              עדכון כותרת
                            </Button>
                          </div>
                        </section>

                        <section className="wallet-custom-fields">
                          <div className="custom-fields-heading">
                            <div>
                              <strong>שדות בכרטיס</strong>
                              <Text type="secondary">ערכו שדה קיים, הוסיפו שדה או מחקו אותו</Text>
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
                      </div>
                    ),
                  },
                  {
                    key: "google-data",
                    label: <span className="wallet-tab-label"><CodeOutlined /> נתוני Google</span>,
                    children: (
                      <section className="google-data-panel">
                        <div className="google-data-toolbar">
                          <strong>נתוני הכרטיס ב־Google Wallet</strong>
                          <Button icon={<ReloadOutlined />} loading={googleDataLoading} onClick={() => void loadGoogleData()}>
                            רענון
                          </Button>
                        </div>
                        {googleDataLoading ? (
                          <div className="google-data-loading"><Spin /></div>
                        ) : googleDataError ? (
                          <Alert type="error" showIcon message={googleDataError} />
                        ) : googleObject ? (
                          <pre className="google-object-json" dir="ltr">{JSON.stringify(googleObject, null, 2)}</pre>
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="אין נתונים להצגה" />
                        )}
                      </section>
                    ),
                  },
                  {
                    key: "links",
                    label: <span className="wallet-tab-label"><LinkOutlined /> קישורים</span>,
                    children: (
                      <div className="tab-content">
                        <section className="link-management">
                          <div className="message-management-heading">
                            <strong>קישורים בכרטיס</strong>
                            <div className="wallet-link-heading-actions">
                              <Tag>{googleLinks.length}/10</Tag>
                              <Popconfirm
                                title="למחוק את כל הקישורים מהכרטיס?"
                                description="הפעולה תעדכן את הכרטיס הקיים ב־Google Wallet."
                                okText="מחיקת הכול"
                                cancelText="ביטול"
                                okButtonProps={{ danger: true }}
                                onConfirm={async () => {
                                  if (await onDeleteAllWalletLinks()) await loadGoogleData();
                                }}
                              >
                                <Button
                                  danger
                                  size="small"
                                  icon={<DeleteOutlined />}
                                  disabled={!googleLinks.length || busy || googleDataLoading}
                                >
                                  מחיקת כל הקישורים
                                </Button>
                              </Popconfirm>
                            </div>
                          </div>
                          {googleLinks.length === 0 ? (
                            <Text type="secondary">אין קישורים בכרטיס</Text>
                          ) : (
                            <div className="wallet-link-list">
                              {googleLinks.map((walletLink, linkIndex) => {
                                const uri = walletLink.uri ?? "";
                                const title = walletLink.description || uri || "קישור";
                                const safeLink = /^(https?:\/\/|mailto:|tel:)/i.test(uri);
                                const isWebLink = /^https?:\/\//i.test(uri);
                                const typeLabel = /^tel:/i.test(uri) ? "טלפון"
                                  : /^mailto:/i.test(uri) ? "אימייל"
                                  : /google\.com\/maps|maps\.app\.goo\.gl/i.test(uri) ? "ניווט"
                                  : "אתר";
                                return (
                                  <div className="wallet-link-item" key={`${walletLink.id ?? uri}-${linkIndex}`}>
                                    <div className="wallet-link-content">
                                      <div className="wallet-link-title">
                                        {safeLink ? <a href={uri} target={isWebLink ? "_blank" : undefined} rel={isWebLink ? "noreferrer" : undefined}>{title}</a> : <span>{title}</span>}
                                        <Tag>{typeLabel}</Tag>
                                      </div>
                                      <small>{uri}</small>
                                    </div>
                                    <div className="wallet-link-actions">
                                      <Tooltip title="הזזה למעלה">
                                        <Button type="text" icon={<ArrowUpOutlined />} aria-label="הזזת קישור למעלה" disabled={busy || googleDataLoading || linkIndex === 0} onClick={() => void handleMoveLink(linkIndex, linkIndex - 1)} />
                                      </Tooltip>
                                      <Tooltip title="הזזה למטה">
                                        <Button type="text" icon={<ArrowDownOutlined />} aria-label="הזזת קישור למטה" disabled={busy || googleDataLoading || linkIndex === googleLinks.length - 1} onClick={() => void handleMoveLink(linkIndex, linkIndex + 1)} />
                                      </Tooltip>
                                      <Popconfirm title="למחוק את הקישור מהכרטיס?" okText="מחיקה" cancelText="ביטול" onConfirm={() => void handleDeleteLink(linkIndex)}>
                                        <Button type="text" danger icon={<DeleteOutlined />} aria-label="מחיקת קישור מהכרטיס" loading={deletingLinkIndex === linkIndex} disabled={busy || googleDataLoading} />
                                      </Popconfirm>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <div className="wallet-link-form">
                            <div>
                              <label htmlFor="wallet-link-description">טקסט הקישור</label>
                              <Input
                                id="wallet-link-description"
                                value={linkDescription}
                                onChange={(event) => setLinkDescription(event.target.value)}
                                placeholder="למשל: חידוש פוליסה"
                                maxLength={20}
                              />
                            </div>
                            <div>
                              <label htmlFor="wallet-link-type">סוג הקישור</label>
                              <Select
                                id="wallet-link-type"
                                value={linkType}
                                onChange={(value: WalletLinkType) => setLinkType(value)}
                                options={[
                                  { value: "website", label: "אתר" },
                                  { value: "phone", label: "טלפון" },
                                  { value: "email", label: "אימייל" },
                                  { value: "navigation", label: "ניווט" },
                                ]}
                              />
                            </div>
                            <div>
                              <label htmlFor="wallet-link-uri">{linkType === "phone" ? "מספר טלפון" : linkType === "email" ? "כתובת אימייל" : linkType === "navigation" ? "כתובת או יעד" : "כתובת אתר"}</label>
                              <Input
                                id="wallet-link-uri"
                                type={linkType === "website" ? "url" : linkType === "email" ? "email" : linkType === "phone" ? "tel" : "text"}
                                value={linkUri}
                                onChange={(event) => setLinkUri(event.target.value)}
                                placeholder={linkType === "phone" ? "*5555 או +972501234567" : linkType === "email" ? "name@example.com" : linkType === "navigation" ? "כתובת, עסק או יעד" : "https://example.com"}
                                maxLength={2048}
                              />
                            </div>
                            <Tooltip title="הוספת קישור לכרטיס">
                              <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                aria-label="הוספת קישור לכרטיס"
                                loading={busy}
                                disabled={!linkDescription.trim() || !linkUri.trim() || busy || googleDataLoading || googleLinks.length >= 10}
                                onClick={() => void handleAddLink()}
                              />
                            </Tooltip>
                          </div>
                        </section>
                      </div>
                    ),
                  },
                  {
                    key: "actions",
                    label: <span className="wallet-tab-label"><ThunderboltOutlined /> פעולות</span>,
                    children: (
                      <div className="tab-content">
                        <section className="message-management">
                          <div className="message-management-heading">
                            <strong>הודעות בכרטיס</strong>
                          <Tooltip title="רענון הודעות">
                            <Button
                              type="text"
                              icon={<ReloadOutlined />}
                              aria-label="רענון הודעות"
                              loading={googleDataLoading}
                              onClick={() => void loadGoogleData()}
                            />
                          </Tooltip>
                        </div>
                        {googleDataLoading ? (
                          <div className="google-data-loading"><Spin /></div>
                        ) : googleDataError ? (
                          <Alert type="error" showIcon message={googleDataError} />
                        ) : googleMessages.length === 0 ? (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="אין הודעות בכרטיס" />
                        ) : (
                          <div className="wallet-message-list">
                            {googleMessages.map((walletMessage, messageIndex) => (
                              <div className="wallet-message-item" key={`${walletMessage.id ?? "message"}-${messageIndex}`}>
                                <div className="wallet-message-content">
                                  <div className="wallet-message-title">
                                    <strong>{walletMessage.header || "הודעה ללא כותרת"}</strong>
                                    {walletMessage.messageType && <Tag>{walletMessage.messageType}</Tag>}
                                  </div>
                                  <Text>{walletMessage.body || ""}</Text>
                                </div>
                                <Popconfirm
                                  title="למחוק את ההודעה מהכרטיס?"
                                  okText="מחיקה"
                                  cancelText="ביטול"
                                  onConfirm={() => void handleDeleteMessage(messageIndex)}
                                >
                                  <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    aria-label="מחיקת הודעה מהכרטיס"
                                    title="מחיקת הודעה מהכרטיס"
                                    loading={deletingMessageIndex === messageIndex}
                                    disabled={busy || googleDataLoading}
                                  />
                                </Popconfirm>
                              </div>
                            ))}
                          </div>
                        )}
                        </section>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    label: <span className="wallet-tab-label"><SafetyCertificateOutlined /> סטטוס</span>,
                    children: (
                      <div className="tab-content">
                        <section className="status-section">
                          <div className="status-summary">
                            <div className="status-icon"><SafetyCertificateOutlined /></div>
                            <div><strong>סטטוס הכרטיס בארנק</strong></div>
                            <Tag color={cardIsNotValid(selectedCard) ? "default" : "green"}>
                              {cardIsNotValid(selectedCard) ? "לא בתוקף" : "פעיל"}
                            </Tag>
                          </div>
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
                        </section>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
