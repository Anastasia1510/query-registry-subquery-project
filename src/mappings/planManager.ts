import { PlanManager__factory } from "@subql/contract-sdk";
import { PlanCreatedEvent, PlanRemovedEvent, PlanTemplateCreatedEvent, PlanTemplateMetadataChangedEvent, PlanTemplateStatusChangedEvent } from "@subql/contract-sdk/typechain/PlanManager";
import assert from 'assert';
import { Plan, PlanTemplate } from "../types";
import FrontierEthProvider from "./ethProvider";
import { bytesToIpfsCid, PLAN_MANAGER_ADDRESS } from "./utils";
import { constants } from 'ethers';
import { FrontierEvmEvent } from "@subql/contract-processors/dist/frontierEvm";

export async function handlePlanTemplateCreated(
  event: FrontierEvmEvent<PlanTemplateCreatedEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const planManager = PlanManager__factory.connect(PLAN_MANAGER_ADDRESS, new FrontierEthProvider());

  const rawPlanTemplate = await planManager.planTemplates(event.args.planTemplateId);

  const planTemplate = PlanTemplate.create({
    id: event.args.planTemplateId.toHexString(),
    period: rawPlanTemplate.period.toBigInt(),
    dailyReqCap: rawPlanTemplate.dailyReqCap.toBigInt(),
    rateLimit: rawPlanTemplate.rateLimit.toBigInt(),
    metadata: constants.HashZero === rawPlanTemplate.metadata
      ? undefined
      : bytesToIpfsCid(rawPlanTemplate.metadata),
    active: true,
  });

  await planTemplate.save();
}

export async function handlePlanTemplateMetadataUpdated(
  event: FrontierEvmEvent<PlanTemplateMetadataChangedEvent['args']>
  ): Promise<void> {
  assert(event.args, 'No event args');

  const id = event.args.planTemplateId.toHexString();

  const planTemplate = await PlanTemplate.get(id);
  assert(planTemplate, `Plan template not found. templateId="${id}"`);
  planTemplate.metadata = bytesToIpfsCid(event.args.metadata);

  await planTemplate.save();
}

export async function handlePlanTemplateStatusUpdated(
  event: FrontierEvmEvent<PlanTemplateStatusChangedEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const id = event.args.planTemplateId.toHexString();
  const planTemplate = await PlanTemplate.get(id);
  assert(planTemplate, `Plan template not found. templateId="${id}"`);

  planTemplate.active = event.args.active;

  await planTemplate.save();
}

export async function handlePlanCreated(
  event: FrontierEvmEvent<PlanCreatedEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const plan = Plan.create({
    id: event.args.planId.toHexString(),
    planTemplateId: event.args.planTemplateId.toHexString(),
    creator: event.args.creator,
    price: event.args.price.toBigInt(),
    active: true,
    deploymentId: constants.HashZero === event.args.deploymentId
      ? undefined
      : bytesToIpfsCid(event.args.deploymentId)
  });

  await plan.save();
}

export async function handlePlanRemoved(
  event: FrontierEvmEvent<PlanRemovedEvent['args']>
): Promise<void> {
  assert(event.args, 'No event args');

  const plan = await Plan.get(event.args.id.toHexString())
  assert(plan, `Plan not found. planId="${event.args.id.toHexString()}"`);

  plan.active = false;

  await plan.save();
}
