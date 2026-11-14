import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, StrictBool, StrictInt, ConfigDict


class WorkflowError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class ServiceInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    quantity: StrictInt = Field(default=1, ge=1, le=100)
    indication: str = Field(min_length=1, max_length=2000)


class EncounterInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    synthetic: StrictBool
    patient: str = Field(min_length=1, max_length=150)
    insurer: str = Field(min_length=1, max_length=150)
    member: str = Field(min_length=1, max_length=120)
    encounter: str = Field(min_length=1, max_length=120)
    historyText: str = Field(min_length=1, max_length=6000)
    examination: str = Field(min_length=1, max_length=6000)
    diagnosis: str = Field(min_length=1, max_length=2000)
    items: list[ServiceInput] = Field(min_length=1, max_length=10)
    source: str = "Manual intake"
    priority: str = "routine"


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def uid():
    return str(uuid.uuid4())


def event(r, title, detail, actor="System"):
    r["history"].insert(
        0, {"id": uid(), "at": now(), "title": title, "detail": detail, "actor": actor}
    )


def fingerprint(p: EncounterInput):
    fields = p.model_dump(exclude={"source", "priority", "synthetic"})
    return hashlib.sha256(
        json.dumps(fields, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def draft(r):
    services = "\n".join(
        f"{n + 1}. {i['name']} — quantity {i['quantity']}. Documented indication: {i['indication']}"
        for n, i in enumerate(r["items"])
    )
    return f"""To: {r["insurer"].lower().replace(" ", "")}@insurer.example
Subject: [{r["reference"]}] Pre-authorisation request

Dear Provider Services Team,

Please review this synthetic demonstration request.

Patient: {r["patient"]}
Membership: {r["member"]}
Encounter: {r["encounter"]}

Clinical summary
{r["historyText"]}

Examination
{r["examination"]}

Working diagnosis
{r["diagnosis"]}

Requested services
{services}

Please confirm authorised services, conditions and authorisation codes.

Managed Care Unit

SYNTHETIC DEMONSTRATION — no email will be sent."""


def intake(p: EncounterInput, id=None, actor="Staff"):
    if p.synthetic is not True:
        raise WorkflowError("This release accepts synthetic records only.")
    id = id or uid()
    r = {
        **p.model_dump(),
        "id": id,
        "reference": "VA-" + id.replace("-", "")[:8].upper(),
        "stage": "draft",
        "createdAt": now(),
        "version": 1,
        "draft": "",
        "submittedDraft": "",
        "reply": None,
        "callback": None,
        "history": [],
    }
    r["items"] = [
        {
            **i.model_dump(),
            "id": f"{id}-item-{n + 1}",
            "outcome": "pending",
            "code": "",
            "approvedQuantity": None,
            "conditions": "",
        }
        for n, i in enumerate(p.items)
    ]
    r["draft"] = draft(r)
    event(
        r,
        "Encounter received",
        f"{p.source} · {len(p.items)} requested services",
        actor,
    )
    event(
        r,
        "Draft prepared",
        "Source-based template ready for staff review. No live AI used.",
    )
    return r


def transition(original, action, p, actor):
    r = copy.deepcopy(original)

    def guard(*states):
        if r["stage"] not in states:
            raise WorkflowError("Action unavailable at the current stage.", 409)

    def content():
        d = p.get("draft")
        if not isinstance(d, str) or not d.strip() or len(d) > 30000:
            raise WorkflowError("Enter a draft of at most 30,000 characters.")
        return d

    if action == "saveDraft":
        guard("draft", "query")
        r["draft"] = content()
        event(r, "Draft edited", "Saved for review. No external message sent.", actor)
    elif action == "submit":
        guard("draft", "query")
        if p.get("reviewed") is not True:
            raise WorkflowError("Review the exact request before submitting.")
        r.update(draft=content(), submittedDraft=content(), stage="pending", reply=None)
        event(
            r,
            "Submission simulated",
            "Reviewed request copied to demo outbox. No real email sent.",
            actor,
        )
    elif action == "reply":
        guard("pending")
        scenario = p.get("scenario")
        if scenario not in ("approved", "partial", "query", "denied"):
            raise WorkflowError("Select a reply scenario.")
        decisions = []
        if scenario == "query":
            body = "Please supply previous investigation results and clarify the documented indication before a decision can be issued."
            r["stage"] = "query"
            event(
                r,
                "Insurer clarification simulated",
                "Additional information needed. No approval recorded.",
                actor,
            )
        else:
            lines = []
            for n, i in enumerate(r["items"]):
                yes = scenario != "denied" and not (scenario == "partial" and n > 0)
                d = {
                    "itemId": i["id"],
                    "outcome": "approved" if yes else "denied",
                    "code": "DEMO-PA-" + r["reference"][-4:] if yes else "",
                    "approvedQuantity": i["quantity"] if yes else 0,
                    "conditions": ""
                    if yes
                    else "Not authorised in this simulated response.",
                }
                decisions.append(d)
                lines.append(
                    f"{i['name']}: {d['outcome'].upper()}. "
                    + (
                        f"Code {d['code']}. Approved quantity {d['approvedQuantity']}."
                        if yes
                        else d["conditions"]
                    )
                )
            body = "\n".join(lines)
            r["stage"] = "review"
            event(
                r,
                "Insurer decision simulated",
                "Proposed interpretation awaits staff verification.",
                actor,
            )
        r["reply"] = {
            "at": now(),
            "scenario": scenario,
            "body": body,
            "decisions": decisions,
            "source": "Simulated insurer reply",
        }
    elif action == "verify":
        guard("review")
        ds = p.get("decisions", [])
        if p.get("reviewed") is not True:
            raise WorkflowError("Confirm you checked the original reply.")
        if (
            not isinstance(ds, list)
            or len(ds) != len(r["items"])
            or any(not isinstance(d, dict) for d in ds)
        ):
            raise WorkflowError("Provide one decision per requested service.")
        ids = [d.get("itemId") for d in ds]
        if any(not isinstance(id, str) for id in ids) or len(set(ids)) != len(
            r["items"]
        ):
            raise WorkflowError("Duplicate or missing service decisions.")
        for i in r["items"]:
            d = next((d for d in ds if d.get("itemId") == i["id"]), None)
            if not d or d.get("outcome") not in (
                "approved",
                "partially_approved",
                "denied",
                "more_information_required",
            ):
                raise WorkflowError("Invalid item decision.")
            q = d.get("approvedQuantity")
            outcome = d["outcome"]
            code = d.get("code", "")
            conditions = d.get("conditions", "")
            if type(q) is not int or not 0 <= q <= i["quantity"]:
                raise WorkflowError(
                    "Approved quantity must be within the requested quantity."
                )
            if (
                not isinstance(code, str)
                or len(code) > 200
                or not isinstance(conditions, str)
                or len(conditions) > 2000
            ):
                raise WorkflowError("Invalid code or conditions.")
            if outcome == "approved" and q != i["quantity"]:
                raise WorkflowError("Full approval requires the requested quantity.")
            if outcome == "partially_approved" and not 0 < q < i["quantity"]:
                raise WorkflowError(
                    "Partial approval requires a smaller positive quantity."
                )
            if outcome in ("approved", "partially_approved") and not code.strip():
                raise WorkflowError("Approved services require a code.")
            if outcome in ("denied", "more_information_required") and (
                q != 0 or not conditions.strip()
            ):
                raise WorkflowError(
                    "Unapproved services need zero quantity and a reason."
                )
            i.update(
                outcome=outcome,
                code=code.strip()
                if outcome in ("approved", "partially_approved")
                else "",
                approvedQuantity=q,
                conditions=conditions,
            )
        r["stage"] = (
            "query"
            if any(i["outcome"] == "more_information_required" for i in r["items"])
            else "resolved"
        )
        r["decisionVersion"] = r.get("decisionVersion", 0) + 1
        r["verifiedAt"] = now()
        r["callback"] = {
            "eventId": uid(),
            "status": "pending",
            "attempts": 0,
            "decisionVersion": r["decisionVersion"],
        }
        event(
            r,
            "Decision verified",
            "Item outcomes checked. Simulated EMR callback queued.",
            actor,
        )
    elif action == "deliver":
        if not r.get("callback") or r["callback"]["status"] == "acknowledged":
            raise WorkflowError("No pending EMR callback.", 409)
        cb = r["callback"]
        cb.update(
            attempts=cb["attempts"] + 1,
            status="failed" if p.get("fail") else "acknowledged",
            at=now(),
        )
        event(
            r,
            "EMR delivery failed (simulation)"
            if p.get("fail")
            else "EMR acknowledged (simulation)",
            "Decision preserved. Retry available."
            if p.get("fail")
            else "Sandbox EMR received the decision.",
            actor,
        )
    elif action == "cancel":
        guard("draft", "pending", "review", "query")
        r["stage"] = "cancelled"
        event(
            r,
            "Request cancelled",
            "History preserved. No real insurer notification.",
            actor,
        )
    else:
        raise WorkflowError("Unknown workflow action.")
    r["version"] += 1
    return r


def seeds():
    data = []
    for n, name in enumerate(
        [
            "Amara Okafor",
            "Tunde Adeyemi",
            "Zainab Musa",
            "Chinedu Eze",
            "Efe Oghene",
            "Bisi Akinola",
            "Ibrahim Bello",
        ]
    ):
        p = EncounterInput(
            synthetic=True,
            patient=f"{name} (demo)",
            insurer=["Acacia Health", "Cedar Assurance", "Northstar HMO"][n % 3],
            member=f"DEMO-{10021 + n}",
            encounter=f"DEMO-ENC-{100 + n}",
            historyText="Synthetic patient reports persistent back pain after lifting at work. No bowel or bladder symptoms documented.",
            examination="Lumbar tenderness; normal documented lower-limb power and sensation.",
            diagnosis="Mechanical back pain (working diagnosis)",
            items=[
                {
                    "name": "Lumbar spine X-ray",
                    "quantity": 1,
                    "indication": "Persistent symptoms and documented clinician request.",
                },
                {
                    "name": "Physiotherapy sessions",
                    "quantity": 4,
                    "indication": "Clinician-requested rehabilitation for functional limitation.",
                },
            ],
        )
        r = intake(p, id=f"seed-{n + 1}")
        r["createdAt"] = (
            datetime.now(timezone.utc) - timedelta(minutes=(n + 1) * 38)
        ).isoformat()
        if n > 0:
            r = transition(
                r, "submit", {"reviewed": True, "draft": r["draft"]}, "Demo staff"
            )
        if n == 2:
            r = transition(r, "reply", {"scenario": "query"}, "Demo staff")
        if n in (3, 4, 5):
            r = transition(
                r,
                "reply",
                {"scenario": "partial" if n == 4 else "approved"},
                "Demo staff",
            )
        if n == 5:
            r = transition(
                r,
                "verify",
                {"reviewed": True, "decisions": r["reply"]["decisions"]},
                "Demo staff",
            )
            r = transition(r, "deliver", {}, "Demo staff")
        data.append((p, r))
    return data
