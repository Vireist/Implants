---
id: eye_god_serial_i
name: «Око Бога» Серия И

category: neural
quality: mass

cost: 50000
maintenance: 3000
subscription: true

slots:
  - eye_left
  - eye_right
extraOccupies: [cranial]

maxInstallations: 2

neuralLoad: 1
capacityBonus: 4

energy:
  type: bioelectric
  risk: low

tags:
  - eye_god
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