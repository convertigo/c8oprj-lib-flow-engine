<script module>export const _flow={sourceVersion:2,page:{id:"home",route:"/",title:"Dates Flow · parité PCA"}};</script>
<FlowComponent $$id="home" label="Dates Flow">
 <Variables>
  <State $$id="response" type="object" value={{"settings":{"timeZone":"","locale":"","months":0,"days":0},"rows":[],"at":"","today":"","now":"","validDate":false}} />
  <State $$id="selected" type="string" value="same-day" />
  <State $$id="due" type="unknown" value={null} />
  <State $$id="order" type="unknown" value={null} />
  <State $$id="remaining" type="unknown" value={null} />
  <State $$id="formatted" type="string" value="" />
  <State $$id="valid" type="boolean" value={false} />
  <State $$id="today" type="string" value="" />
  <State $$id="now" type="string" value="" />
  <State $$id="longDate" type="string" value="" />
  <State $$id="invalid" type="boolean" value={false} />
  <State $$id="epoch" type="string" value="" />
  <State $$id="clock" type="string" value="--:--:--" />
  <Derived $$id="currentPoste" type="object" value={page.response.rows.find(r => r.id === page.selected) || {"id":"","input":{"id":"","dateRemiseMateriel":"","dateDerniereMiseAJour":null,"actif":false},"dateEcheance":null,"dateEcheanceFr":"","statut":"","days":null}} />
  <Derived $$id="reference" type="string" value={page.currentPoste.input.dateDerniereMiseAJour || page.currentPoste.input.dateRemiseMateriel || ""} />
  <Derived $$id="status" type="string" value={!page.currentPoste.input.actif ? "INACTIF" : !page.valid ? "DATE_INVALIDE" : page.order <= 0 ? "A_RELANCER" : "A_JOUR"} />
  <Derived $$id="parity" type="boolean" value={page.due === page.currentPoste.dateEcheance && page.formatted === page.currentPoste.dateEcheanceFr && page.status === page.currentPoste.statut && page.remaining === page.currentPoste.days} />
  <Derived $$id="clockParity" type="string" value={page.response.rows.length > 0 && page.today === page.response.today && page.now === page.response.now && page.invalid === page.response.validDate ? "PARITÉ HORLOGE OK" : "Chargement de la référence"} />
 </Variables>
 <Events>
  <OnMount $$id="load"><Actions>
   <CallSequence $$id="loadServer" requestable=".DatePca" outputSchema={{"type":"object","properties":{"at":{"type":"string"},"today":{"type":"string"},"now":{"type":"string"},"validDate":{"type":"boolean"},"settings":{"type":"object","properties":{"timeZone":{"type":"string"},"locale":{"type":"string"},"months":{"type":"number"},"days":{"type":"number"}}},"rows":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"dateReference":{"type":"string"},"dateEcheance":{"type":"string","nullable":true},"dateEcheanceFr":{"type":"string"},"statut":{"type":"string"},"days":{"type":"number","nullable":true},"input":{"type":"object","properties":{"id":{"type":"string"},"dateRemiseMateriel":{"type":"string"},"dateDerniereMiseAJour":{"type":"string","nullable":true},"actif":{"type":"boolean"}}}}}}}}} />
   <SetValue $$id="keepServer" target="page.response" value="@loadServer" />
   <DateToday $$id="todayBrowser" $$out="page.today" at="@page.response.at" timeZone="@page.response.settings.timeZone" />
   <DateNow $$id="nowBrowser" $$out="page.now" format="iso" at="@page.response.at" timeZone="@page.response.settings.timeZone" />
   <DateFormat $$id="longBrowser" $$out="page.longDate" value="@page.today" pattern="long" locale="@page.response.settings.locale" timeZone="@page.response.settings.timeZone" />
   <DateIsValid $$id="strictBrowser" $$out="page.invalid" value="2026-02-30" />
   <DateIso $$id="compatibilityIso" $$out="page.epoch" value={0} />
   
 <DateIsValid $$id="initialValid" $$out="page.valid" value="@page.reference" />
 <DateAdd $$id="initialDue" $$out="page.due" value="@page.reference" months="@page.response.settings.months" days="@page.response.settings.days" timeZone="@page.response.settings.timeZone" />
 <DateCompare $$id="initialOrder" $$out="page.order" left="@page.due" right="@page.today" timeZone="@page.response.settings.timeZone" />
 <DateDiff $$id="initialDays" $$out="page.remaining" from="@page.today" to="@page.due" timeZone="@page.response.settings.timeZone" />
 <DateFormat $$id="initialFormat" $$out="page.formatted" value="@page.due" pattern="dd/MM/yyyy" locale="@page.response.settings.locale" timeZone="@page.response.settings.timeZone" />
  </Actions></OnMount>
  <Interval $$id="legacyClock" milliseconds={1000} immediate={true}><Actions>
   <DateNow $$id="timestamp" />
   <DateFormat $$id="clockText" $$out="page.clock" value="@timestamp" locale="fr-FR" options={{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",second:"2-digit"}} fallback="--:--:--" />
  </Actions></Interval>
 </Events>
 <Structure><PageShell $$id="pageShell" gap="16px" maxWidth="1000px" padding="24px"><Children>
  <Card $$id="heading"><Children>
   <Text $$id="title" text="Dates Flow : parité serveur / navigateur" />
   <Text $$id="description" text="Chaque cas est recalculé dans le navigateur avec les blocs date.* et comparé à la référence du Flow." />
   <Text $$id="zone" text={"Fuseau : " + (page.response.settings.timeZone || "…")} />
   <Text $$id="todayLabel" text={"Aujourd'hui : " + page.today + " · " + page.longDate} />
   <Text $id="instantLabel" text={"Instant figé pour la parité : " + page.response.at} />
   <Text $id="nowLabel" text={"Horodatage ISO de référence : " + page.now} />
   <Text $$id="clockParityLabel" text="@page.clockParity" />
   <Text $$id="legacyClockLabel" text={"Horloge compatible : " + page.clock} />
   <Text $$id="legacyIsoLabel" text={"date.iso(0) compatible : " + page.epoch} />
   <Status $$id="loadStatus" actionId="loadServer" showError={true} showLoading={true} />
  </Children></Card>
  <Select $$id="caseChoice" label="Cas PCA" options={[{"value":"same-day","label":"same-day"},{"value":"previous-day","label":"previous-day"},{"value":"next-day","label":"next-day"},{"value":"history","label":"history"},{"value":"inactive","label":"inactive"},{"value":"invalid","label":"invalid"}]} value="@page.selected"><Events><OnChange $$id="changeCase"><Actions>
   <SetValue $$id="selectCase" target="page.selected" value="@event.value" />
   
 <DateIsValid $$id="selectedValid" $$out="page.valid" value="@page.reference" />
 <DateAdd $$id="selectedDue" $$out="page.due" value="@page.reference" months="@page.response.settings.months" days="@page.response.settings.days" timeZone="@page.response.settings.timeZone" />
 <DateCompare $$id="selectedOrder" $$out="page.order" left="@page.due" right="@page.today" timeZone="@page.response.settings.timeZone" />
 <DateDiff $$id="selectedDays" $$out="page.remaining" from="@page.today" to="@page.due" timeZone="@page.response.settings.timeZone" />
 <DateFormat $$id="selectedFormat" $$out="page.formatted" value="@page.due" pattern="dd/MM/yyyy" locale="@page.response.settings.locale" timeZone="@page.response.settings.timeZone" />
  </Actions></OnChange></Events></Select>
  <Card $$id="comparison" class="date-parity-case"><Children>
   <Text $$id="selectedTitle" text={"Cas : " + page.selected} />
   <Text $id="referenceLabel" text={"Date de référence : " + page.reference} />
   <Text $$id="server" text={"Serveur : " + (page.currentPoste.dateEcheanceFr || "date invalide") + " · " + page.currentPoste.statut + " · jours=" + page.currentPoste.days} />
   <Text $$id="browser" text={"Navigateur : " + (page.formatted || "date invalide") + " · " + page.status + " · jours=" + page.remaining} />
   <Text $$id="parityResult" text={page.parity ? "PARITÉ OK" : "PARITÉ EN ATTENTE"} />
  </Children></Card>
  <Text $$id="referencesHeading" text="Les six références calculées par le Flow" />
  <ForEach $$id="postes" source="@page.response.rows" context="poste" key="id"><Children>
   <DatePcaRow $$id="posteDates" row="@poste" />
  </Children></ForEach>
 </Children></PageShell></Structure>
</FlowComponent>
