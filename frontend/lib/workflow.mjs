export function callbackPayload(r) {
  return {
    schema_version: "1.0",
    event_id: r.callback?.eventId,
    event_type: "authorisation.decision_verified",
    external_encounter_id: r.encounter,
    request_id: r.reference,
    decision_version: r.decisionVersion,
    review_status: "verified",
    simulation: true,
    items: r.items.map((i) => ({
      external_order_id: i.id,
      outcome: i.outcome,
      authorisation_code: i.code || null,
      approved_quantity: i.approvedQuantity,
      conditions: i.conditions || null,
    })),
  };
}
