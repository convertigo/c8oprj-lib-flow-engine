<script module>export const _flow={sourceVersion:2,kind:"component",id:"DatePcaRow",label:"Référence serveur PCA",props:{row:{type:"object",default:{},label:"Poste calculé",description:"Résultat de référence du Flow date PCA."}}};</script>
<FlowComponent $$id="DatePcaRow"><Structure><Card $$id="rowCard" class="date-server-row"><Children>
 <Text $$id="postId" text="@props.row.id" />
 <Text $$id="due" text="@props.row.dateEcheanceFr" />
 <Text $$id="status" text="@props.row.statut" />
</Children></Card></Structure></FlowComponent>
