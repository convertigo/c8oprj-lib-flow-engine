const _flow = {
  "sourceVersion": 2,
  "accessibility": "private",
  "inputs": {
    "at": {
      "type": "string",
      "default": "2026-03-14T23:30:00Z",
      "description": "Reference instant; empty uses the actual clock."
    },
    "posts": {
      "type": "array",
      "items": { "type": "object" },
      "default": [
        {
          "id": "same-day",
          "dateRemiseMateriel": "2025-12-31",
          "dateDerniereMiseAJour": null,
          "actif": true
        },
        {
          "id": "previous-day",
          "dateRemiseMateriel": "2025-12-27",
          "dateDerniereMiseAJour": null,
          "actif": true
        },
        {
          "id": "next-day",
          "dateRemiseMateriel": "2026-01-01",
          "dateDerniereMiseAJour": null,
          "actif": true
        },
        {
          "id": "history",
          "dateRemiseMateriel": "2025-01-01",
          "dateDerniereMiseAJour": "2026-01-10",
          "actif": true
        },
        {
          "id": "inactive",
          "dateRemiseMateriel": "2025-12-31",
          "dateDerniereMiseAJour": null,
          "actif": false
        },
        {
          "id": "invalid",
          "dateRemiseMateriel": "2026-02-30",
          "dateDerniereMiseAJour": null,
          "actif": true
        }
      ]
    }
  },
  "config": {
    "date": {
      "timeZone": "Europe/Paris",
      "locale": "fr-FR"
    },
    "pca": {
      "delaiMois": 2,
      "delaiJours": 15
    }
  },
  "tests": {
    "reference": {},
    "live": {
      "input": {
        "at": ""
      }
    }
  }
};
function sample_DatePca({input,config,result}) {
 result.settings = {timeZone:config.date.timeZone,locale:config.date.locale,months:config.pca.delaiMois,days:config.pca.delaiJours}
 result.at = input.at
 result.today = date.today({at:input.at})
 result.now = date.now({format:"iso",at:input.at})
 result.validDate = date.isValid({value:"2026-02-30"})
 json.array({path:"result.rows",itemType:{type:"object"}})
 forEach({items:input.posts,$$nodes:function(){
  local.ref = current.dateDerniereMiseAJour == null || current.dateDerniereMiseAJour == "" ? current.dateRemiseMateriel : current.dateDerniereMiseAJour
  local.valid = date.isValid({value:local.ref})
  local.due = date.add({value:local.ref,months:config.pca.delaiMois,days:config.pca.delaiJours})
  local.order = date.compare({left:local.due,right:result.today})
  local.days = date.diff({from:result.today,to:local.due})
  local.display = date.format({value:local.due,pattern:"dd/MM/yyyy",locale:config.date.locale})
  local.status = !current.actif ? "INACTIF" : !local.valid ? "DATE_INVALIDE" : local.order <= 0 ? "A_RELANCER" : "A_JOUR"
  json.push({path:"result.rows",value:{id:current.id,dateReference:local.ref,dateEcheance:local.due,dateEcheanceFr:local.display,statut:local.status,days:local.days,input:current}})
 }})
}
