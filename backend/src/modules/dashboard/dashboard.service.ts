*** Begin Patch
*** Update File: backend/src/modules/dashboard/dashboard.service.ts
@@
-import { SstObjectives } from '../phva-advanced/schemas/phva-advanced-sst-objective.schema';
+// SstObjectives model removed as part of SST objectives dashboard revert
@@
-    @InjectModel(SstObjectives.name)
-    private readonly sstObjectivesModel: Model<Document & SstObjectives>,
+    // sstObjectivesModel removed
   ) {}
@@
-  async getSstObjectivesSummary(companyId: Types.ObjectId): Promise<{ summary: SstObjectivesSummary; objectives: any[] }> {
-    const record = await this.sstObjectivesModel.findOne({ companyId }).lean().exec();
-    const objectives = (record?.objectives ?? []) as any[];
-    const total = objectives.length;
-    const active = objectives.filter((o) => o.active).length;
-    const completed = objectives.filter((o) => o.status === 'Completed').length;
-    const delayed = objectives.filter((o) => o.status === 'Delayed').length;
-    const now = new Date();
-    const expired = objectives.filter((o) => o.dueDate && new Date(o.dueDate) < now && o.status !== 'Completed').length;
-    const compliance = total === 0 ? 0 : Math.round((completed / total) * 100);
-
-    const summary: SstObjectivesSummary = { total, active, completed, delayed, expired, compliance };
-
-    return { summary, objectives };
-  }
+  // getSstObjectivesSummary removed as part of SST objectives dashboard revert
*** End Patch