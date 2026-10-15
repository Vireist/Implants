---
id: chipware_socket
name: Гнездо для чипов ЧипСлот М-456

category: neural
quality: mass

cost: 64000
maintenance: 0
subscription: false

slots:
  - cranial
extraOccupies: []

neuralLoad: 1
capacityBonus: 0

energy:
  type: bioelectric
  risk: low

tags:
  - chipware_socket
  - bioelectric
  - parasite                   
conflicts:
  ids: []                     # Несовместим с конкретными id: [cranial_shunt]
  tags: []                    # Несовместим с имплантами, у которых есть тег: [eye_god]
  slots: []                   # Несовместим, если занят слот: [cranial]
requires:
  ids: []                     # Требует установленный имплант: [neural_base]
  tags: []                    # Требует имплант с тегом: [backup]
  freeSlots: []               # Требует свободный слот: [eye_left]
  attributes: {}              # Требует характеристику персонажа, напр.:
                              #   logic: { gte: 2 }      операторы: gt | gte | lt | lte | eq
                              #   ключи: logic | willpower | budget
---

Описание в Markdown: абзацы, списки, **жирный**, заголовки ## и ###.

## Особенности

- Пункт списка с нюансами отыгрыша.